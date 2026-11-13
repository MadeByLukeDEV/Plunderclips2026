import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a real dev server, Postgres and Redis (pnpm dev:services, db:migrate,
 * and the dev users from `pnpm --filter @plunderclips/identity seed:dev`).
 *
 * The server runs on its own port with dev login on and Cloudflare's always-pass Turnstile test
 * keys, so a run never touches your own dev server or a real captcha. Values set here win over
 * .env.local, because Next never overrides variables that are already in the environment.
 */
const PORT = 3400;
/**
 * E2E_BASE_URL points the tests at a server that's already running (Next 16 won't start a second
 * dev server in the same folder while `pnpm dev` runs). That server needs DEV_LOGIN=true and the
 * Turnstile test keys, with BETTER_AUTH_URL matching its own address.
 */
const EXTERNAL = process.env.E2E_BASE_URL;
const BASE = EXTERNAL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    navigationTimeout: 90_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: EXTERNAL
    ? undefined
    : {
        command: `pnpm exec next dev -p ${PORT}`,
        url: `${BASE}/api/health`,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        env: {
          DEV_LOGIN: "true",
          BETTER_AUTH_URL: BASE,
          TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
          TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
        },
      },
});
