// CLI entry for database backup (Stage 11).
//
// Usage:
//   pnpm tsx scripts/backup-db.ts [options]
//
// Options:
//   -o, --output <path>      Output file path (default: backups/openpbl-YYYYMMDD-HHmmss.<ext>)
//   -f, --format <format>    Backup format: custom|plain|directory (default: custom)
//   -c, --compress           Enable gzip compression (plain format only)
//       --retain-days <days> Backup retention days (default: 7)
//   -h, --help               Show help
//
// Examples:
//   pnpm tsx scripts/backup-db.ts
//   pnpm tsx scripts/backup-db.ts --format=plain --compress
//   pnpm tsx scripts/backup-db.ts -o /tmp/backup.sql -f plain --retain-days=30

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import path from "node:path";

type BackupFormat = "custom" | "plain" | "directory";

interface ParsedArgs {
  output?: string;
  format: BackupFormat;
  compress: boolean;
  retainDays: number;
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
      "Usage: tsx scripts/backup-db.ts [options]",
      "",
      "Options:",
      "  -o, --output <path>      输出文件路径(默认 backups/openpbl-YYYYMMDD-HHmmss.<ext>)",
      "  -f, --format <format>    备份格式:custom|plain|directory(默认 custom)",
      "  -c, --compress           启用 gzip 压缩(仅 plain 格式)",
      "      --retain-days <days> 备份保留天数(默认 7)",
      "  -h, --help               显示帮助",
      "",
      "Examples:",
      "  tsx scripts/backup-db.ts",
      "  tsx scripts/backup-db.ts --format=plain --compress",
      "  tsx scripts/backup-db.ts -o /tmp/backup.sql -f plain",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    format: "custom",
    compress: false,
    retainDays: 7,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--output" || arg === "-o") {
      if (!next) throw new Error("--output 需要指定路径");
      args.output = next;
      i++;
    } else if (arg === "--format" || arg === "-f") {
      if (!next || !["custom", "plain", "directory"].includes(next)) {
        throw new Error("--format 必须是 custom|plain|directory");
      }
      args.format = next as BackupFormat;
      i++;
    } else if (arg === "--compress" || arg === "-c") {
      args.compress = true;
    } else if (arg === "--retain-days") {
      if (!next) throw new Error("--retain-days 需要指定天数");
      const days = Number(next);
      if (!Number.isFinite(days) || days <= 0 || !Number.isInteger(days)) {
        throw new Error("--retain-days 必须是正整数");
      }
      args.retainDays = days;
      i++;
    } else {
      throw new Error(`未知参数:${arg}`);
    }
  }
  if (args.compress && args.format !== "plain") {
    throw new Error("--compress 仅在 --format=plain 时有效");
  }
  return args;
}

function parseDatabaseUrl(url: string): ConnectionParams {
  // Format: postgresql://user:password@host:port/database?params
  // User/password may be URL-encoded; port is optional (default 5432)
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

function timestamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function defaultOutputPath(format: BackupFormat, compress: boolean): string {
  let ext: string;
  if (format === "custom") {
    ext = "backup";
  } else if (format === "plain") {
    ext = compress ? "sql.gz" : "sql";
  } else {
    ext = "dir";
  }
  return path.join("backups", `openpbl-${timestamp()}.${ext}`);
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function checkPgDumpExists(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pg_dump", ["--version"], { stdio: "ignore" });
    proc.on("error", () => {
      reject(new Error("pg_dump 未安装或不在 PATH 中,请先安装 PostgreSQL 客户端工具"));
    });
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump --version 退出码 ${code}`));
    });
  });
}

function ensureOutputDir(outputPath: string, format: BackupFormat): void {
  const dir = format === "directory" ? outputPath : path.dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function removePath(p: string): void {
  if (!existsSync(p)) return;
  try {
    const stat = statSync(p);
    if (stat.isDirectory()) {
      rmSync(p, { recursive: true, force: true });
    } else {
      unlinkSync(p);
    }
  } catch {
    // ignore cleanup errors
  }
}

function runPlainCompressedBackup(
  pgDumpArgs: string[],
  env: NodeJS.ProcessEnv,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const dump = spawn("pg_dump", pgDumpArgs, { env });
    const gzip = createGzip();
    const output = createWriteStream(outputPath);

    let stderrData = "";
    let dumpExitCode: number | null = null;
    let outputClosed = false;
    let rejected = false;

    const fail = (msg: string): void => {
      if (rejected) return;
      rejected = true;
      removePath(outputPath);
      reject(new Error(msg));
    };

    const finalize = (): void => {
      if (rejected) return;
      if (dumpExitCode === null || !outputClosed) return;
      if (dumpExitCode === 0) {
        resolve();
      } else {
        fail(
          `pg_dump 失败(退出码 ${dumpExitCode})${stderrData ? `: ${stderrData}` : ""}`,
        );
      }
    };

    dump.stderr.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString();
    });
    dump.stdout.pipe(gzip).pipe(output);

    dump.on("error", (err) => fail(`pg_dump 启动失败:${err.message}`));
    gzip.on("error", (err) => fail(`gzip 流错误:${err.message}`));
    output.on("error", (err) => fail(`写入文件失败:${err.message}`));
    output.on("close", () => {
      outputClosed = true;
      finalize();
    });
    dump.on("close", (code) => {
      dumpExitCode = code ?? -1;
      finalize();
    });
  });
}

function runDirectBackup(
  args: ParsedArgs,
  pgDumpArgs: string[],
  env: NodeJS.ProcessEnv,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fullArgs = [...pgDumpArgs, "--file", outputPath];
    const dump = spawn("pg_dump", fullArgs, { env });
    let stderrData = "";

    dump.stderr.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString();
    });

    dump.on("error", (err) => {
      removePath(outputPath);
      reject(new Error(`pg_dump 启动失败:${err.message}`));
    });

    dump.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        removePath(outputPath);
        reject(
          new Error(
            `pg_dump 失败(退出码 ${code})${stderrData ? `: ${stderrData}` : ""}`,
          ),
        );
      }
    });
  });
}

function runBackup(args: ParsedArgs, conn: ConnectionParams): Promise<string> {
  const outputPath = args.output ?? defaultOutputPath(args.format, args.compress);
  ensureOutputDir(outputPath, args.format);

  const pgDumpArgs: string[] = [
    "--host",
    conn.host,
    "--port",
    conn.port,
    "--username",
    conn.user,
    "--format",
    args.format,
    conn.database,
  ];

  const env: NodeJS.ProcessEnv = { ...process.env, PGPASSWORD: conn.password };

  const backupPromise =
    args.format === "plain" && args.compress
      ? runPlainCompressedBackup(pgDumpArgs, env, outputPath)
      : runDirectBackup(args, pgDumpArgs, env, outputPath);

  return backupPromise.then(() => outputPath);
}

function cleanupOldBackups(
  retainDays: number,
): { deleted: string[]; failed: string[] } {
  const backupsDir = path.join(process.cwd(), "backups");
  if (!existsSync(backupsDir)) {
    return { deleted: [], failed: [] };
  }

  const deleted: string[] = [];
  const failed: string[] = [];
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;

  for (const entry of readdirSync(backupsDir)) {
    if (!entry.startsWith("openpbl-")) continue;
    const fullPath = path.join(backupsDir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.mtimeMs < cutoff) {
      try {
        if (stat.isDirectory()) {
          rmSync(fullPath, { recursive: true, force: true });
        } else {
          unlinkSync(fullPath);
        }
        deleted.push(entry);
      } catch (err) {
        failed.push(`${entry}: ${(err as Error).message}`);
      }
    }
  }
  return { deleted, failed };
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

  console.log("===== openPBL 数据库备份 =====");
  console.log(`开始时间:${startTimestamp}`);
  console.log(`目标数据库:${conn.host}:${conn.port}/${conn.database}`);
  console.log(`备份格式:${args.format}${args.compress ? " (gzip 压缩)" : ""}`);
  console.log(`保留天数:${args.retainDays} 天`);

  try {
    await checkPgDumpExists();
  } catch (err) {
    console.error(`错误:${(err as Error).message}`);
    process.exit(1);
  }

  let outputPath: string;
  try {
    outputPath = await runBackup(args, conn);
  } catch (err) {
    console.error(`备份失败:${(err as Error).message}`);
    process.exit(1);
  }

  const size = statSync(outputPath).size;
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log("\n===== 备份成功 =====");
  console.log(`结束时间:${new Date().toISOString()}`);
  console.log(`耗时:${duration} 秒`);
  console.log(`文件大小:${fileSize(size)}`);
  console.log(`文件路径:${path.resolve(outputPath)}`);

  if (args.retainDays > 0) {
    console.log(`\n清理超过 ${args.retainDays} 天的旧备份...`);
    const result = cleanupOldBackups(args.retainDays);
    if (result.deleted.length > 0) {
      console.log(`已删除 ${result.deleted.length} 个旧备份:`);
      for (const name of result.deleted) console.log(`  - ${name}`);
    } else {
      console.log("无过期备份。");
    }
    if (result.failed.length > 0) {
      console.warn(`跳过 ${result.failed.length} 个无法删除的文件:`);
      for (const msg of result.failed) console.warn(`  ! ${msg}`);
    }
  }
}

main().catch((err) => {
  console.error(`未捕获错误:${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
