/**
 * Entry for the Better Auth CLI only (`pnpm --filter @plunderclips/identity auth:schema`).
 * Fills placeholder env so the config can be built without real secrets; nothing here connects anywhere.
 */
process.env.DATABASE_URL ??= "postgres://cli:cli@localhost:5432/cli";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.BETTER_AUTH_SECRET ??= "cli-placeholder-secret-cli-placeholder-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

const { getAuth } = await import("./src/auth");
export const auth = getAuth();
