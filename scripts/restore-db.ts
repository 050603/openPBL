// CLI entry for database restore (Stage 11).
//
// Usage:
//   pnpm tsx scripts/restore-db.ts <backup-file> [options]
//
// Options:
//   --yes                Skip confirmation prompt
//   --drop-existing      Drop and recreate the target database before restore
//                        (DANGEROUS — requires double confirmation)
//   -h, --help           Show help
//
// File format auto-detection:
//   .backup / .dump       -> pg_restore (custom format)
//   .sql                  -> psql       (plain format)
//   .sql.gz               -> gunzip | psql (plain gzip)
//   .dir                  -> pg_restore (directory format)

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import readline from "node:readline";
import path from "node:path";

type DetectedFormat = "custom" | "plain" | "plain-gz" | "directory";

interface ParsedArgs {
  file: string;
  yes: boolean;
  dropExisting: boolean;
}

interface ConnectionParams {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function printUsage(): void {
  console.log(
    [
      "Usage: tsx scripts/restore-db.ts <backup-file> [options]",
      "",
      "Options:",
      "  --yes                跳过确认提示",
      "  --drop-existing      恢复前删除并重建目标数据库(危险操作,需二次确认)",
      "  -h, --help           显示帮助",
      "",
      "File format auto-detection:",
      "  .backup / .dump       -> pg_restore (custom 格式)",
      "  .sql                  -> psql       (plain 格式)",
      "  .sql.gz               -> gunzip | psql (plain gzip)",
      "  .dir                  -> pg_restore (directory 格式)",
      "",
      "Examples:",
      "  tsx scripts/restore-db.ts backups/openpbl-20250101-020000.backup",
      "  tsx scripts/restore-db.ts backups/openpbl-20250101-020000.sql --yes",
      "  tsx scripts/restore-db.ts backups/openpbl-20250101-020000.backup --drop-existing --yes",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    file: "",
    yes: false,
    dropExisting: false,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--yes") {
      args.yes = true;
    } else if (arg === "--drop-existing") {
      args.dropExisting = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`未知参数:${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length === 0) {
    throw new Error("缺少必填参数:<backup-file>");
  }
  if (positional.length > 1) {
    throw new Error(`多余的位置参数:${positional.slice(1).join(", ")}`);
  }
  args.file = positional[0];
  return args;
}

function parseDatabaseUrl(url: string): ConnectionParams {
  const match = url.match(
    /^postgres(?:ql)?:\/\/([^:@/]+)(?::([^@/]*))?@([^:/]+)(?::(\d+))?\/([^?]+)/,
  );
  if (!match) {
    throw new Error(
      "无法解析 DATABASE_URL,期望格式:postgresql://user:password@host:port/database",
    );
  }
  const [, user, password, host, port, database] = match;
  return {
    user: decodeURIComponent(user),
    password: password ? decodeURIComponent(password) : "",
    host,
    port: port ?? "5432",
    database: decodeURIComponent(database),
  };
}

function detectFormat(filePath: string): DetectedFormat {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".backup") || lower.endsWith(".dump")) return "custom";
  if (lower.endsWith(".sql.gz")) return "plain-gz";
  if (lower.endsWith(".sql")) return "plain";
  if (lower.endsWith(".dir")) return "directory";
  // Fall back to filesystem inspection
  if (existsSync(filePath)) {
    const stat = statSync(filePath);
    if (stat.isDirectory()) return "directory";
  }
  throw new Error(
    `无法识别文件格式:${filePath}(支持 .backup/.dump/.sql/.sql.gz/.dir)`,
  );
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function checkToolExists(tool: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(tool, ["--version"], { stdio: "ignore" });
    proc.on("error", () => {
      reject(
        new Error(
          `${tool} 未安装或不在 PATH 中,请先安装 PostgreSQL 客户端工具`,
        ),
      );
    });
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${tool} --version 退出码 ${code}`));
    });
  });
}

interface RunResult {
  code: number;
  stderr: string;
  stdout: string;
}

function runCommand(
  cmd: string,
  cmdArgs: string[],
  env: NodeJS.ProcessEnv,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cmdArgs, { env });
    let stderrData = "";
    let stdoutData = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString();
    });
    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutData += chunk.toString();
    });
    proc.on("error", (err) => {
      reject(new Error(`${cmd} 启动失败:${err.message}`));
    });
    proc.on("close", (code) => {
      resolve({ code: code ?? -1, stderr: stderrData, stdout: stdoutData });
    });
  });
}

function dropAndCreateDatabase(
  conn: ConnectionParams,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  // Connect to the maintenance database "postgres" to drop and recreate.
  const maintenanceArgs = [
    "--host",
    conn.host,
    "--port",
    conn.port,
    "--username",
    conn.user,
    "--dbname",
    "postgres",
    "--no-password",
    "--set",
    "ON_ERROR_STOP=on",
  ];

  // Quote identifier safely (basic — assumes no special chars in db name)
  const dbName = `"${conn.database.replace(/"/g, '""')}"`;

  return runCommand(
    "psql",
    [...maintenanceArgs, "-c", `DROP DATABASE IF EXISTS ${dbName};`],
    env,
  ).then((dropResult) => {
    if (dropResult.code !== 0) {
      throw new Error(
        `DROP DATABASE 失败(退出码 ${dropResult.code})${dropResult.stderr ? `: ${dropResult.stderr}` : ""}`,
      );
    }
    console.log(`已删除数据库:${conn.database}`);
    return runCommand(
      "psql",
      [...maintenanceArgs, "-c", `CREATE DATABASE ${dbName};`],
      env,
    );
  }).then((createResult) => {
    if (createResult.code !== 0) {
      throw new Error(
        `CREATE DATABASE 失败(退出码 ${createResult.code})${createResult.stderr ? `: ${createResult.stderr}` : ""}`,
      );
    }
    console.log(`已创建数据库:${conn.database}`);
  });
}

function runPgRestore(
  filePath: string,
  conn: ConnectionParams,
  env: NodeJS.ProcessEnv,
): Promise<RunResult> {
  const args = [
    "--host",
    conn.host,
    "--port",
    conn.port,
    "--username",
    conn.user,
    "--dbname",
    conn.database,
    "--no-password",
    "--verbose",
    filePath,
  ];
  return runCommand("pg_restore", args, env);
}

function runPsqlPlain(
  filePath: string,
  conn: ConnectionParams,
  env: NodeJS.ProcessEnv,
): Promise<RunResult> {
  const args = [
    "--host",
    conn.host,
    "--port",
    conn.port,
    "--username",
    conn.user,
    "--dbname",
    conn.database,
    "--no-password",
    "--set",
    "ON_ERROR_STOP=on",
    "--file",
    filePath,
  ];
  return runCommand("psql", args, env);
}

function runPsqlPlainGz(
  filePath: string,
  conn: ConnectionParams,
  env: NodeJS.ProcessEnv,
): Promise<RunResult> {
  // Decompress via spawn and pipe to psql stdin
  return new Promise((resolve, reject) => {
    const gunzip = spawn("gunzip", ["-c", filePath], { env });
    const psqlArgs = [
      "--host",
      conn.host,
      "--port",
      conn.port,
      "--username",
      conn.user,
      "--dbname",
      conn.database,
      "--no-password",
      "--set",
      "ON_ERROR_STOP=on",
      "--quiet",
    ];
    const psql = spawn("psql", psqlArgs, { env });

    let stderrData = "";
    let stdoutData = "";
    let gunzipExitCode: number | null = null;
    let psqlExitCode: number | null = null;
    let rejected = false;

    const fail = (msg: string): void => {
      if (rejected) return;
      rejected = true;
      reject(new Error(msg));
    };

    const finalize = (): void => {
      if (rejected) return;
      if (gunzipExitCode === null || psqlExitCode === null) return;
      const code = psqlExitCode;
      resolve({ code, stderr: stderrData, stdout: stdoutData });
    };

    gunzip.stderr.on("data", (chunk: Buffer) => {
      stderrData += `[gunzip] ${chunk.toString()}`;
    });
    psql.stderr.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString();
    });
    psql.stdout.on("data", (chunk: Buffer) => {
      stdoutData += chunk.toString();
    });

    gunzip.stdout.pipe(psql.stdin);

    gunzip.on("error", (err) => fail(`gunzip 启动失败:${err.message}`));
    psql.on("error", (err) => fail(`psql 启动失败:${err.message}`));

    gunzip.on("close", (code) => {
      gunzipExitCode = code ?? -1;
      if (gunzipExitCode !== 0) {
        fail(`gunzip 失败(退出码 ${gunzipExitCode})`);
      } else {
        // Signal EOF to psql stdin
        psql.stdin.end();
        finalize();
      }
    });
    psql.on("close", (code) => {
      psqlExitCode = code ?? -1;
      finalize();
    });
  });
}

function countRestoredObjects(stderr: string): number {
  // pg_restore --verbose prints lines like:
  //   "processing data for table \"public.foo\""
  //   "creating TABLE \"public.foo\""
  // Count "processing data" lines as a rough measure of restored tables.
  const matches = stderr.match(/processing data for table/g);
  return matches ? matches.length : 0;
}

async function performRestore(
  format: DetectedFormat,
  filePath: string,
  conn: ConnectionParams,
  env: NodeJS.ProcessEnv,
): Promise<RunResult> {
  switch (format) {
    case "custom":
    case "directory":
      return runPgRestore(filePath, conn, env);
    case "plain":
      return runPsqlPlain(filePath, conn, env);
    case "plain-gz":
      return runPsqlPlainGz(filePath, conn, env);
    default: {
      const exhaustive: never = format;
      throw new Error(`未处理的格式:${exhaustive}`);
    }
  }
}

async function main(): Promise<void> {
  const startTime = Date.now();
  const startTimestamp = new Date().toISOString();

  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`参数错误:${(err as Error).message}`);
    printUsage();
    process.exit(1);
  }

  if (!existsSync(args.file)) {
    console.error(`错误:备份文件不存在:${args.file}`);
    process.exit(1);
  }

  const stat = statSync(args.file);
  if (args.file.toLowerCase().endsWith(".dir") && !stat.isDirectory()) {
    console.error(`错误:.dir 路径不是目录:${args.file}`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "错误:DATABASE_URL 环境变量未配置。请先设置 DATABASE_URL 后再运行此脚本。",
    );
    process.exit(1);
  }

  let conn: ConnectionParams;
  try {
    conn = parseDatabaseUrl(databaseUrl);
  } catch (err) {
    console.error(`错误:${(err as Error).message}`);
    process.exit(1);
  }

  let format: DetectedFormat;
  try {
    format = detectFormat(args.file);
  } catch (err) {
    console.error(`错误:${(err as Error).message}`);
    process.exit(1);
  }

  console.log("===== openPBL 数据库恢复 =====");
  console.log(`开始时间:${startTimestamp}`);
  console.log(`目标数据库:${conn.host}:${conn.port}/${conn.database}`);
  console.log(`备份文件:${path.resolve(args.file)}`);
  console.log(`检测格式:${format}`);

  const env: NodeJS.ProcessEnv = { ...process.env, PGPASSWORD: conn.password };

  // First confirmation: any restore operation
  if (!args.yes) {
    console.log(
      "\n⚠️  警告:恢复操作将修改目标数据库中的数据,可能覆盖现有数据。",
    );
    const answer = await prompt(
      `确认要恢复到数据库 "${conn.database}" 吗?(输入 yes 继续):`,
    );
    if (answer.toLowerCase() !== "yes") {
      console.log("已取消恢复操作。");
      process.exit(0);
    }
  }

  // Second confirmation: --drop-existing
  if (args.dropExisting) {
    console.log(
      "\n🚨 严重警告:--drop-existing 将完全删除并重建目标数据库,所有现有数据将丢失!",
    );
    if (!args.yes) {
      const answer1 = await prompt(
        "再次确认要执行 DROP DATABASE + CREATE DATABASE 吗?(输入 yes 继续):",
      );
      if (answer1.toLowerCase() !== "yes") {
        console.log("已取消 --drop-existing 操作。");
        process.exit(0);
      }
      const answer2 = await prompt(
        `最终确认:输入数据库全名 "${conn.database}" 以确认删除:`,
      );
      if (answer2 !== conn.database) {
        console.log("输入的数据库名称不匹配,已取消。");
        process.exit(0);
      }
    }
    await checkToolExists("psql");
    try {
      await dropAndCreateDatabase(conn, env);
    } catch (err) {
      console.error(`错误:删除/创建数据库失败:${(err as Error).message}`);
      process.exit(1);
    }
  }

  // Verify restore tool availability
  const tool = format === "plain" || format === "plain-gz" ? "psql" : "pg_restore";
  try {
    await checkToolExists(tool);
  } catch (err) {
    console.error(`错误:${(err as Error).message}`);
    process.exit(1);
  }

  let result: RunResult;
  try {
    result = await performRestore(format, args.file, conn, env);
  } catch (err) {
    console.error(`恢复失败:${(err as Error).message}`);
    process.exit(1);
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  if (result.code !== 0) {
    console.error("\n===== 恢复失败 =====");
    console.error(`结束时间:${new Date().toISOString()}`);
    console.error(`耗时:${duration} 秒`);
    console.error(`退出码:${result.code}`);
    if (result.stderr) {
      console.error("stderr 输出:");
      console.error(result.stderr);
    }
    process.exit(1);
  }

  console.log("\n===== 恢复成功 =====");
  console.log(`结束时间:${new Date().toISOString()}`);
  console.log(`耗时:${duration} 秒`);
  if (format === "custom" || format === "directory") {
    const restoredObjects = countRestoredObjects(result.stderr);
    console.log(`恢复的数据表数(估计):${restoredObjects}`);
  }
  if (result.stderr) {
    // pg_restore --verbose prints informational messages to stderr
    const lines = result.stderr.split("\n").filter(Boolean);
    console.log(`verbose 日志行数:${lines.length}`);
  }
}

main().catch((err) => {
  console.error(`未捕获错误:${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
