import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-next-production.mjs <build|start> [...args]");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const distDir = process.env.NEXT_DIST_DIR?.trim() || ".next-build";
const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_DIST_DIR: distDir },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not start Next.js: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
