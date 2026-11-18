import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Weekly rotation, daily stats and creator analytics against the local Postgres. Runs in a week
 * in 2031 so clips other test files add around today never get in the way.
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("weekly rotation and analytics (Postgres)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { and, eq, like } = await import("drizzle-orm");
  const r = await import("../src/rotation");
  const { isoWeek } = await import("../src/week");

  const run = `test:${Date.now()}${Math.random().toString(36).slice(2, 8)}:`;
  const now = new Date("2031-03-12T12:00:00Z"); // a Wednesday
  const period = isoWeek(now);
  const channel = `rot${Date.now().toString(36)}`;
  const ids: Record<string, string> = {};

  async function insert(name: string, o: Partial<typeof schema.clip.$inferInsert> = {}) {
    const [row] = await db()
      .insert(schema.clip)
      .values({
        key: `${run}${name}`,
        platform: "twitch",
        kind: "clip",
        platformId: `${run}${name}`,
        canonicalUrl: `https://clips.twitch.tv/${run}${name}`,
        title: name,
        status: "approved",
        channel,
        approvedAt: new Date("2031-03-11T10:00:00Z"),
        ...o,
      })
      .returning({ id: schema.clip.id });
    ids[name] = row!.id;
  }

  const modId = `test-rot-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  beforeAll(async () => {
    // This file's own mod: other test files delete their users while this one runs.
    await db()
      .insert(schema.user)
      .values({
        id: modId,
        name: "rotation mod",
        email: `${modId}@example.test`,
        role: "mod",
        updatedAt: new Date(),
      });
    await insert("top", { voteCount: 9, viewCount: 10 });
    await insert("second", { voteCount: 5, viewCount: 500 });
    await insert("tie-more-views", { voteCount: 1, viewCount: 90 });
    await insert("tie-fewer-views", { voteCount: 1, viewCount: 20 });
    await insert("last-week", {
      voteCount: 99,
      viewCount: 1000,
      approvedAt: new Date("2031-03-08T10:00:00Z"),
    });
    await insert("pending", { status: "pending", voteCount: 50 });
    await insert("mod-pick", { voteCount: 0 });
    await insert("excluded", { voteCount: 7 });
    await db().insert(schema.clipSection).values({
      clipId: ids["mod-pick"]!,
      sectionSlug: "weekly",
      period,
      position: 0,
      addedByUserId: modId,
    });
  });

  afterAll(async () => {
    await db()
      .delete(schema.clip)
      .where(like(schema.clip.key, `${run}%`));
    await db().delete(schema.user).where(eq(schema.user.id, modId));
  });

  const weekly = async () =>
    (
      await db()
        .select({
          id: schema.clipSection.clipId,
          position: schema.clipSection.position,
          by: schema.clipSection.addedByUserId,
        })
        .from(schema.clipSection)
        .where(
          and(eq(schema.clipSection.sectionSlug, "weekly"), eq(schema.clipSection.period, period)),
        )
        .orderBy(schema.clipSection.position)
    ).map((x) => Object.entries(ids).find(([, v]) => v === x.id)?.[0]);

  it("fills the week with this week's clips by votes, then views; never pending or last week's", async () => {
    await r.excludeFromWeek(db(), "weekly", period, [ids.excluded!], modId);

    await r.rotateWeekly(now);
    const list = await weekly();
    expect(list).toEqual(["mod-pick", "top", "second", "tie-more-views", "tie-fewer-views"]);
  });

  it("re-ranks on the next run as votes change, without duplicating", async () => {
    await db()
      .update(schema.clip)
      .set({ voteCount: 20 })
      .where(eq(schema.clip.id, ids["tie-fewer-views"]!));
    await r.rotateWeekly(now);
    const list = await weekly();
    expect(list.filter((n) => n !== "mod-pick").slice(0, 2)).toEqual(["tie-fewer-views", "top"]);
    expect(new Set(list).size).toBe(list.length);
    expect(list).not.toContain("excluded");
  });

  it("reports a creator's totals, top clips and daily gains from snapshots", async () => {
    const yesterday = new Date(now.getTime() - 86_400_000);
    await r.snapshotClipStats(yesterday);
    await db().update(schema.clip).set({ viewCount: 40 }).where(eq(schema.clip.id, ids.top!));
    await r.snapshotClipStats(now);

    const a = await r.clipAnalytics(
      [{ platform: "twitch", handle: channel, authorUrls: [] }],
      7,
      now,
    );
    // pending isn't counted; the rest are.
    expect(a.totals.clips).toBe(7);
    expect(a.top.map((c) => c.title).slice(0, 2)).toEqual(["last-week", "second"]);
    const today = a.daily.at(-1)!;
    const before = a.daily.at(-2)!;
    expect(today.day).toBe("2031-03-12");
    // "top" went from 10 to 40 views today.
    expect(today.views).toBe(30);
    // Yesterday is the first snapshot. Clips approved that day count their views as that day's
    // gain (10 + 500 + 90 + 20); "last-week" (approved earlier, 1000 views) is only a baseline.
    expect(before.views).toBe(620);
    expect(a.sections.find((s) => s.slug === "weekly")!.picks).toBeGreaterThanOrEqual(5);
  });
});
