import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** "Your clips" queries against the local Postgres. Skipped without DATABASE_URL; cleans up after itself. */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("my clips (Postgres)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { eq, like } = await import("drizzle-orm");
  const m = await import("../src/mine");

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const me = `test-${run}-me`;
  const other = `test-${run}-other`;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    for (const id of [me, other])
      await db()
        .insert(schema.user)
        .values({ id, name: id, email: `${id}@example.test`, updatedAt: new Date() });
    const rows = [
      ["p1", "pending", me, 0, 0],
      ["p2", "pending", me, 0, 0],
      ["a1", "approved", me, 4, 10],
      ["a2", "approved", me, 1, 5],
      ["r1", "rejected", me, 0, 0],
      ["theirs", "pending", other, 0, 0],
      ["anon", "pending", null, 0, 0],
    ] as const;
    for (const [i, [name, status, by, votes, views]] of rows.entries()) {
      const [row] = await db()
        .insert(schema.clip)
        .values({
          key: `test:${run}:${name}`,
          platform: "twitch",
          kind: "clip",
          platformId: name,
          canonicalUrl: `https://clips.twitch.tv/${name}`,
          title: name,
          status,
          submittedByUserId: by,
          voteCount: votes,
          viewCount: views,
          rejectReason: status === "rejected" ? "Not Sea of Thieves" : null,
          createdAt: new Date(Date.now() - (rows.length - i) * 60_000),
          approvedAt: status === "approved" ? new Date() : null,
        })
        .returning({ id: schema.clip.id });
      ids[name] = row!.id;
    }
  });

  afterAll(async () => {
    await db()
      .delete(schema.clip)
      .where(like(schema.clip.key, `test:${run}:%`));
    await db()
      .delete(schema.user)
      .where(like(schema.user.id, `test-${run}-%`));
  });

  const names = (clips: { id: string }[]) =>
    clips.map((c) => Object.entries(ids).find(([, id]) => id === c.id)?.[0]);

  it("lists only my clips, newest first, with review fields", async () => {
    const page = await m.listMyClips(me);
    expect(names(page.clips)).toEqual(["r1", "a2", "a1", "p2", "p1"]);
    expect(page.clips.find((c) => c.id === ids.r1)?.rejectReason).toBe("Not Sea of Thieves");
    expect(page.nextCursor).toBeNull();
  });

  it("filters by status", async () => {
    expect(names((await m.listMyClips(me, { status: "pending" })).clips)).toEqual(["p2", "p1"]);
    expect(names((await m.listMyClips(me, { status: "approved" })).clips)).toEqual(["a2", "a1"]);
  });

  it("counts by status and sums votes and views on live clips", async () => {
    expect(await m.myClipStats(me)).toEqual({
      pending: 2,
      approved: 2,
      rejected: 1,
      votes: 5,
      views: 15,
    });
    expect(await m.myClipStats(`test-${run}-nobody`)).toEqual({
      pending: 0,
      approved: 0,
      rejected: 0,
      votes: 0,
      views: 0,
    });
  });

  describe("withdraw", () => {
    it("deletes my own pending clip", async () => {
      expect(await m.withdrawClip(me, ids.p1!)).toEqual({ ok: true });
      const [row] = await db().select().from(schema.clip).where(eq(schema.clip.id, ids.p1!));
      expect(row).toBeUndefined();
    });

    it("refuses reviewed clips, other people's clips and bad ids", async () => {
      expect(await m.withdrawClip(me, ids.a1!)).toEqual({ ok: false, error: "not_pending" });
      expect(await m.withdrawClip(me, ids.r1!)).toEqual({ ok: false, error: "not_pending" });
      expect(await m.withdrawClip(me, ids.theirs!)).toEqual({ ok: false, error: "not_found" });
      expect(await m.withdrawClip(me, ids.anon!)).toEqual({ ok: false, error: "not_found" });
      expect(await m.withdrawClip(me, "nope")).toEqual({ ok: false, error: "not_found" });
      const [theirs] = await db().select().from(schema.clip).where(eq(schema.clip.id, ids.theirs!));
      expect(theirs?.status).toBe("pending");
    });
  });
});
