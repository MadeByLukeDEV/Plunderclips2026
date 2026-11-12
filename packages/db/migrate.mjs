// Applies pending migrations from ./migrations, then exits: 0 when the schema is up to date,
// 1 (with the database's own error message) when a migration fails.
// Used by the `migrate` service on every deploy. Plain JS so it runs without a TS toolchain.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

const started = Date.now();
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
  });
  console.log(`migrate: schema up to date (${Date.now() - started} ms)`);
  await sql.end();
  process.exit(0);
} catch (err) {
  const e = /** @type {any} */ (err);
  console.error("migrate: failed:", e?.cause?.message ?? e?.message ?? e);
  if (e?.cause?.detail) console.error("migrate: detail:", e.cause.detail);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
