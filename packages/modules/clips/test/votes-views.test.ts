import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Votes and views against the local Postgres and Redis (pnpm dev:services + pnpm db:migrate).
 * Skipped unless both DATABASE_URL and REDIS_URL are set. Cleans up its rows and keys.
 */
const ready = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;

describe.skipIf(!ready)("votes and views (Postgres + Redis)", async () => {
  Object.assign(process.env, {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { redis } = await import("@plunderclips/shared");
  const { eq, like } = await import("drizzle-orm");
  const { setVote, hasVoted, voterKey, VOTE_LIMIT } = await import("../src/votes");
  const { recordView, flushViews, pendingViews } = await import("../src/views");
  const { listClips, decodeCursor } = await import("../src/queries");

  // Random suffix: test files run in parallel and must never share a key prefix.
  const run = `test:${Date.now()}${Math.random().toString(36).slice(2, 8)}:`;
  const tag = `t${Date.now().toString(36)}`;
  const ids: Record<string, string> = {};
  const voters = Array.from({ length: 5 }, (_, i) => ({ ipHash: `${run}voter${i}` }));

  async function counts(id: string) {
    const [row] = await db()
      .select({ votes: schema.clip.voteCount, views: schema.clip.viewCount })
      .from(schema.clip)
      .where(eq(schema.clip.id, id));
    return row!;
  }

  beforeAll(async () => {
    for (const [name, status] of [
      ["a", "approved"],
      ["b", "approved"],
      ["c", "approved"],
      ["pending", "pending"],
    ] as const) {
      const [row] = await db()
        .insert(schema.clip)
        .values({
          key: `${run}${name}`,
          platform: "twitch",
          kind: "clip",
          platformId: name,
          canonicalUrl: `https://clips.twitch.tv/${name}`,
          title: name,
          status,
          approvedAt: new Date(),
        })
        .returning({ id: schema.clip.id });
      ids[name] = row!.id;
    }
  });

  afterAll(async () => {
    await db()
      .delete(schema.clip)
      .where(like(schema.clip.key, `${run}%`));
    const r = redis();
    for (const pattern of [`rl:vote:ip:${run}*`, `rl:view:${run}*`, `views:seen:*:${run}*`]) {
      const keys = await r.keys(pattern);
      if (keys.length) await r.del(...keys);
    }
    for (const id of Object.values(ids)) await r.hdel("views:pending", id);
    r.disconnect();
  });

  describe("votes", () => {
    it("counts one vote per voter and keeps the counter in step", async () => {
      const v = voters[0]!;
      expect(await setVote(ids.a!, v, true)).toEqual({ ok: true, voted: true, votes: 1 });
      expect(await setVote(ids.a!, v, true)).toEqual({ ok: true, voted: true, votes: 1 });
      expect(await hasVoted(ids.a!, v)).toBe(true);
      expect(await setVote(ids.a!, voters[1]!, true)).toMatchObject({ votes: 2 });
      expect(await setVote(ids.a!, v, false)).toEqual({ ok: true, voted: false, votes: 1 });
      expect(await setVote(ids.a!, v, false)).toEqual({ ok: true, voted: false, votes: 1 });
      expect(await hasVoted(ids.a!, v)).toBe(false);
      expect((await counts(ids.a!)).votes).toBe(1);
    });

    it("survives concurrent votes on one clip without losing any", async () => {
      await Promise.all(voters.map((v) => setVote(ids.b!, v, true)));
      expect((await counts(ids.b!)).votes).toBe(5);
      const [{ n }] = (await db().execute(
        `select count(*)::int as n from clip_vote where clip_id = '${ids.b}'`,
      )) as unknown as [{ n: number }];
      expect(n).toBe(5);
    });

    it("refuses pending clips, bad ids and visitors it can't identify", async () => {
      expect(await setVote(ids.pending!, voters[0]!, true)).toEqual({
        ok: false,
        error: "not_found",
      });
      expect(await setVote("nope", voters[0]!, true)).toEqual({ ok: false, error: "not_found" });
      expect(await setVote(ids.a!, null, true)).toEqual({ ok: false, error: "no_voter" });
    });

    it("rate-limits vote flipping per voter", async () => {
      const v = { ipHash: `${run}flipper` }; // fresh voter: an empty rate-limit window
      const results = [];
      for (let i = 0; i < VOTE_LIMIT.limit + 1; i++)
        results.push(await setVote(ids.c!, v, i % 2 === 0));
      expect(results.at(-1)).toEqual({ ok: false, error: "rate_limited" });
      expect(results.slice(0, -1).every((r) => r.ok)).toBe(true);
    });

    it("keeps members and anonymous visitors apart", () => {
      expect(voterKey({ userId: "u1" })).toBe("u:u1");
      expect(voterKey({ ipHash: "abc" })).toBe("ip:abc");
    });
  });

  describe("views", () => {
    it("counts one view per visitor per clip, then flushes to Postgres", async () => {
      expect(await recordView(ids.a!, `${run}viewer1`)).toBe("counted");
      expect(await recordView(ids.a!, `${run}viewer1`)).toBe("seen");
      expect(await recordView(ids.a!, `${run}viewer2`)).toBe("counted");
      expect(await recordView(ids.c!, `${run}viewer1`)).toBe("counted");
      expect(await pendingViews(ids.a!)).toBe(2);

      const before = await counts(ids.a!);
      await flushViews({ force: true });
      expect((await counts(ids.a!)).views).toBe(before.views + 2);
      expect((await counts(ids.c!)).views).toBeGreaterThanOrEqual(1);
      expect(await pendingViews(ids.a!)).toBe(0);
    });

    it("ignores pending clips and bad ids", async () => {
      expect(await recordView(ids.pending!, `${run}viewer1`)).toBe("not_found");
      expect(await recordView("not-a-uuid", `${run}viewer1`)).toBe("not_found");
      expect(await pendingViews(ids.pending!)).toBe(0);
    });

    it("flushes at most once a minute unless forced", async () => {
      await redis().set("views:flush-lock", "1", "EX", 60);
      expect(await recordView(ids.b!, `${run}viewer3`)).toBe("counted");
      expect(await flushViews()).toBe(0);
      expect(await pendingViews(ids.b!)).toBe(1);
      expect(await flushViews({ force: true })).toBeGreaterThanOrEqual(1);
      expect(await pendingViews(ids.b!)).toBe(0);
      await redis().del("views:flush-lock");
    });

    it("recovers a batch left behind by a crashed flush", async () => {
      const stale = `views:flushing:${Date.now() - 10 * 60_000}:dead`;
      await redis().hset(stale, ids.c!, "3");
      const before = (await counts(ids.c!)).views;
      await flushViews({ force: true });
      expect(await redis().exists(stale)).toBe(0);
      // Merged back into pending first, then flushed in the same run.
      expect((await counts(ids.c!)).views + (await pendingViews(ids.c!))).toBe(before + 3);
    });
  });

  describe("top sort", () => {
    beforeAll(async () => {
      for (const id of [ids.a!, ids.b!, ids.c!])
        await db()
          .update(schema.clip)
          .set({ tags: [tag] })
          .where(eq(schema.clip.id, id));
    });

    it("orders by votes and pages with a top cursor", async () => {
      const all = await db()
        .select({ id: schema.clip.id, votes: schema.clip.voteCount })
        .from(schema.clip)
        .where(like(schema.clip.key, `${run}%`));
      const expected = all
        .filter((r) => r.id !== ids.pending)
        .sort((x, y) => y.votes - x.votes || (y.id > x.id ? 1 : -1))
        .map((r) => r.id);

      const first = await listClips({ sort: "top", limit: 60 });
      const mine = first.clips.map((c) => c.id).filter((id) => expected.includes(id));
      expect(mine).toEqual(expected);
      expect(first.clips[0]!.voteCount).toBeGreaterThanOrEqual(first.clips.at(-1)!.voteCount);

      const page1 = await listClips({ sort: "top", limit: 1 });
      expect(decodeCursor(page1.nextCursor)?.sort).toBe("top");
      const page2 = await listClips({ sort: "top", limit: 1, cursor: page1.nextCursor });
      expect(page2.clips[0]!.id).not.toBe(page1.clips[0]!.id);
    });

    it("ignores a cursor from the other sort order", async () => {
      const newest = await listClips({ limit: 1 });
      const top = await listClips({ sort: "top", limit: 1, cursor: newest.nextCursor });
      const topFirst = await listClips({ sort: "top", limit: 1 });
      expect(top.clips[0]!.id).toBe(topFirst.clips[0]!.id);
    });
  });
});
