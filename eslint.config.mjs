import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["services/agent/**/*.ts"],
    ignores: ["services/agent/actions/index.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [{ name: "ai", importNames: ["tool", "dynamicTool"], message: "Register application tools through actions/actionTool so results and effects are checked." }] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".local/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
