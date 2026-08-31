import { spawn } from "node:child_process";
import { access, cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const [mode, command, ...forwardedArgs] = process.argv.slice(2);
const supportedModes = new Set(["legacy", "new"]);
const supportedCommands = new Set(["dev", "build", "start"]);

if (!supportedModes.has(mode) || !supportedCommands.has(command)) {
  console.error("Usage: node scripts/run-openpbl-mode.mjs <legacy|new> <dev|build|start> [...args]");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const distDir = command === "dev" ? `.next-${mode}-dev` : `.next-${mode}`;
const modeLabel = mode === "new" ? "新版五阶段系统" : "原始六阶段系统";

console.log(`[OpenPBL] ${modeLabel} · ${command} · 构建目录 ${distDir}`);

function optionValue(args, longName, shortName) {
  const equalsValue = args.find((arg) => arg.startsWith(`${longName}=`));
  if (equalsValue) return equalsValue.slice(longName.length + 1);
  const index = args.findIndex((arg) => arg === longName || arg === shortName);
  return index >= 0 ? args[index + 1] : undefined;
}

let executableArgs = [nextBin, command, ...forwardedArgs];
const childEnv = {
  ...process.env,
  NEXT_DIST_DIR: distDir,
  NEXT_PUBLIC_OPENPBL_SYSTEM_MODE: mode,
};

if (command === "start") {
  const supportedStartArgs = new Set(["--port", "-p", "--hostname", "-H"]);
  for (let index = 0; index < forwardedArgs.length; index += 1) {
    const arg = forwardedArgs[index];
    if (arg.startsWith("--port=") || arg.startsWith("--hostname=")) continue;
    if (!supportedStartArgs.has(arg)) {
      console.error(`[OpenPBL] start 不支持参数：${arg}`);
      process.exit(1);
    }
    index += 1;
  }

  const standaloneDir = path.resolve(distDir, "standalone");
  const serverFile = path.join(standaloneDir, "server.js");
  try {
    await access(serverFile);
  } catch {
    console.error(`[OpenPBL] 未找到 ${modeLabel} 的生产构建，请先运行 pnpm build:${mode}`);
    process.exit(1);
  }

  const standaloneDistDir = path.join(standaloneDir, distDir);
  await mkdir(standaloneDistDir, { recursive: true });
  await cp(path.resolve("public"), path.join(standaloneDir, "public"), {
    recursive: true,
    force: true,
  });
  await cp(path.resolve(distDir, "static"), path.join(standaloneDistDir, "static"), {
    recursive: true,
    force: true,
  });

  childEnv.PORT = optionValue(forwardedArgs, "--port", "-p")
    || process.env.PORT
    || (mode === "new" ? "3100" : "3000");
  childEnv.HOSTNAME = optionValue(forwardedArgs, "--hostname", "-H")
    || process.env.HOSTNAME
    || "0.0.0.0";
  executableArgs = [serverFile];
}

const child = spawn(process.execPath, executableArgs, {
  cwd: process.cwd(),
  env: childEnv,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("error", (error) => {
  console.error(`[OpenPBL] 无法启动 ${modeLabel}: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
