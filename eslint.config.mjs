import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const reactAdvisories = {
  "react-hooks/set-state-in-effect": "warn",
  "react-hooks/refs": "warn",
  "react-hooks/purity": "warn",
};

const eslintConfig = defineConfig([
  ...nextVitals.map((config) =>
    config.plugins?.["react-hooks"]
      ? {
          ...config,
          rules: { ...config.rules, ...reactAdvisories },
        }
      : config,
  ),
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "public/**",
    "**/dist/**",
    "**/*.d.ts",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
