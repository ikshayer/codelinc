import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Client code talks to engines only through /api/* (CONTRACT §7, 1.1.0): no registry,
  // engine or AI code (or mocks) in the browser bundle.
  {
    files: ["src/ui/**", "src/components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["@/ai", "@/ai/*", "@/api", "@/api/*", "@/benefits", "@/benefits/*", "@/optimizer", "@/optimizer/*", "**/fixtures/**"] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "backend/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
