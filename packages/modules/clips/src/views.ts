import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { logger, redis, slidingWindow } from "@plunderclips/shared";

/**
 * View counter: Redis first, Postgres later.
 *   views:seen:<clip>:<visitor>  one view per visitor per clip per 6 hours (SET NX EX)
 *   views:pending               hash clipId → views not yet in Postgres
 *   views:flush-lock            at most one flush a minute, across all app instances
 * A flush renames the pending hash (atomic hand-off), adds it to clip.view_count in one
 * UPDATE, and puts the numbers back if Postgres fails, so no view is lost or counted twice.
 */
const PENDING = "views:pending";
const LOCK = "views:flush-lock";
const SEEN_TTL = 6 * 60 * 60;
const FLUSH_EVERY = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 120 view beacons a minute per visitor; more is a script. */
export const VIEW_LIMIT = { limit: 120, windowSeconds: 60 } as const;

export type ViewResult = "counted" | "seen" | "not_found" | "rate_limited";

/**
 * Counts a view by `visitor` (a voter key or IP hash). Only published clips count.
 * Returns quickly; call flushViews() afterwards (e.g. in Next's `after`).
 */
export async function recordView(clipId: string, visitor: string): Promise<ViewResult> {
  if (!UUID.test(clipId)) return "not_found";
  const limited = await slidingWindow(
    `view:${visitor}`,
    VIEW_LIMIT.limit,
    VIEW_LIMIT.windowSeconds,
  );
  if (!limited.ok) return "rate_limited";

  const r = redis();
  const first = await r.set(`views:seen:${clipId}:${visitor}`, "1", "EX", SEEN_TTL, "NX");
  if (first !== "OK") return "seen";

  // Checked after the dedupe key so a flood of one fake id costs one query, not one per beacon.
  const [exists] = await db()
    .select({ id: schema.clip.id })
    .from(schema.clip)
    .where(and(eq(schema.clip.id, clipId), eq(schema.clip.status, "approved")))
    .limit(1);
  if (!exists) return "not_found";

  await r.hincrby(PENDING, clipId, 1);
  return "counted";
}

/** Views counted in Redis but not yet flushed, for live totals. */
export async function pendingViews(clipId: string): Promise<number> {
  const v = await redis()
    .hget(PENDING, clipId)
    .catch(() => null);
  return v ? Number.parseInt(v, 10) || 0 : 0;
}

/**
 * Moves pending views into Postgres. No-op unless a minute has passed since the last flush
 * (unless forced). Returns how many clips were updated.
 */
export async function flushViews(opts: { force?: boolean } = {}): Promise<number> {
  const r = redis();
  if (!opts.force) {
    const lock = await r.set(LOCK, "1", "EX", FLUSH_EVERY, "NX");
    if (lock !== "OK") return 0;
  }

  await recoverStaleBatches();

  const batch = `views:flushing:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    await r.rename(PENDING, batch);
  } catch {
    return 0; // nothing pending (RENAME fails on a missing key)
  }

  const raw = await r.hgetall(batch);
  const rows = Object.entries(raw)
    .map(([id, n]) => [id, Number.parseInt(n, 10)] as const)
    .filter(([id, n]) => UUID.test(id) && n > 0);

  try {
    if (rows.length) {
      const values = sql.join(
        rows.map(([id, n]) => sql`(${id}::text, ${n}::int)`),
        sql`, `,
      );
      await db().execute(
        sql`update ${schema.clip} set view_count = ${schema.clip.viewCount} + v.n
            from (values ${values}) as v(id, n) where ${schema.clip.id} = v.id`,
      );
    }
    await r.del(batch);
    return rows.length;
  } catch (err) {
    // Put the numbers back for the next flush.
    const pipe = r.multi();
    for (const [id, n] of rows) pipe.hincrby(PENDING, id, n);
    pipe.del(batch);
    await pipe.exec().catch(() => {});
    logger.error("view flush failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

/** A process that died mid-flush leaves its renamed batch behind: merge batches older than 5 minutes back. */
async function recoverStaleBatches(): Promise<void> {
  const r = redis();
  const cutoff = Date.now() - 5 * 60_000;
  let cursor = "0";
  do {
    const [next, keys] = await r.scan(cursor, "MATCH", "views:flushing:*", "COUNT", 100);
    cursor = next;
    for (const key of keys) {
      const ts = Number(key.split(":")[2]);
      if (!Number.isFinite(ts) || ts > cutoff) continue;
      const raw = await r.hgetall(key);
      const pipe = r.multi();
      for (const [id, n] of Object.entries(raw))
        pipe.hincrby(PENDING, id, Number.parseInt(n, 10) || 0);
      pipe.del(key);
      await pipe.exec();
    }
  } while (cursor !== "0");
}
