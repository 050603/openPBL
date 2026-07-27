import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

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
const prismaEnv = { ...process.env };
// OpenPBL connects directly to PostgreSQL. A no-engine/Data Proxy client
// accepts only prisma:// URLs and makes local postgresql:// deployments fail
// during Next.js instrumentation startup.
delete prismaEnv.PRISMA_GENERATE_NO_ENGINE;
prismaEnv.PRISMA_CLIENT_ENGINE_TYPE = "library";

const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: prismaEnv,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else if (process.argv[2] === "generate") {
  assertLocalQueryEngine();
}

function assertLocalQueryEngine() {
  const require = createRequire(import.meta.url);
  const prismaClientEntry = require.resolve("@prisma/client");
  const generatedClientDir = path.resolve(
    path.dirname(prismaClientEntry),
    "..",
    "..",
    ".prisma",
    "client",
  );
  const hasLocalEngine = readdirSync(generatedClientDir).some((file) =>
    /^(?:lib)?query_engine.+\.node$/.test(file),
  );
  if (!hasLocalEngine) {
    throw new Error(
      "Prisma Client was generated without a local query engine. " +
        "OpenPBL requires the standard library engine for postgresql:// URLs.",
    );
  }
}
