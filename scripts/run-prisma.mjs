import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const prismaCli = path.join(
  process.cwd(),
  "node_modules",
  "prisma",
  "build",
  "index.js",
);
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
