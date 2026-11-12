import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Root config for packages/*. apps/web has its own (Next) config that extends the same rule.
export const moduleBoundaries = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["@plunderclips/*/src", "@plunderclips/*/src/*", "**/modules/*/src/**"],
          message: "Import a module through its public entry (e.g. '@plunderclips/clips'), not its internals.",
        },
      ],
    },
  ],
};

export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/.next/**", "**/dist/**", "packages/db/migrations/**", "apps/**"]),
  ...tseslint.configs.recommended,
  { files: ["**/*.ts", "**/*.tsx"], rules: moduleBoundaries },
]);
