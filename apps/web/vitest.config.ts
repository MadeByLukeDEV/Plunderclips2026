import { configDefaults, defineConfig } from "vitest/config";

// Unit tests only. The Playwright end-to-end specs in e2e/ run with `pnpm test:e2e`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
