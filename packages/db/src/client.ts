import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@plunderclips/shared";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pg?: postgres.Sql };

function connection() {
  globalForDb.__pg ??= postgres(env().DATABASE_URL, { max: 10 });
  return globalForDb.__pg;
}

export function db() {
  return drizzle(connection(), { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof db>;

/** Cheap connectivity check for health endpoints. */
export async function ping() {
  await connection()`select 1`;
}
