import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs against the local Postgres (pnpm dev:services + pnpm db:migrate). Skipped without DATABASE_URL.
 * Every row it writes uses a "test:<run>:" key and is deleted afterwards.
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("clip queries (Postgres)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { like } = await import("drizzle-orm");
  const q = await import("../src/queries");
  const { isoWeek, previousWeek } = await import("../src/week");

  const run = `test:${Date.now()}:`;
  const now = new Date("2026-11-12T12:00:00Z");
  const ids: Record<string, string> = {};

  async function insert(name: string, o: Partial<typeof schema.clip.$inferInsert> = {}) {
    const [row] = await db()
      .insert(schema.clip)
      .values({
        key: `${run}${name}`,
        platform: "twitch",
        kind: "clip",
        platformId: name,
        canonicalUrl: `https://clips.twitch.tv/${name}`,
        title: name,
        status: "approved",
        submitterIpHash: "secret-hash",
        submitterNote: "private note",
        ...o,
      })
      .returning({ id: schema.clip.id });
    ids[name] = row!.id;
  }

  beforeAll(async () => {
    // Newest first: a (1 day old) … e (5 days old). f is pending, g rejected, h 10 days old.
    for (const [i, name] of ["a", "b", "c", "d", "e"].entries())
      await insert(name, {
        approvedAt: new Date(now.getTime() - (i + 1) * 86_400_000),
        channel: name === "a" || name === "c" ? "samestreamer" : "other",
        tags: name === "b" ? ["kraken"] : name === "d" ? ["kraken", "pvp"] : [],
      });
    await insert("f", { status: "pending" });
    await insert("g", { status: "rejected" });
    await insert("h", { approvedAt: new Date(now.getTime() - 10 * 86_400_000) });
  });

  afterAll(async () => {
    await db()
      .delete(schema.clip)
      .where(like(schema.clip.key, `${run}%`));
  });

  const mine = (clips: { id: string }[]) =>
    clips.map((c) => Object.entries(ids).find(([, id]) => id === c.id)?.[0]).filter(Boolean);

  it("lists approved clips only, newest first, without private fields", async () => {
    const page = await q.listClips({ limit: 60 });
    const names = mine(page.clips);
    expect(names.slice(0, 6)).toEqual(expect.arrayContaining(["a", "b", "c", "d", "e", "h"]));
    expect(names).not.toContain("f");
    expect(names).not.toContain("g");
    const a = page.clips.find((c) => c.id === ids.a)!;
    expect(a).not.toHaveProperty("submitterIpHash");
    expect(a).not.toHaveProperty("submitterNote");
    expect(a).not.toHaveProperty("status");
  });

  it("paginates with a cursor without repeats or gaps", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 50; i++) {
      const page: Awaited<ReturnType<typeof q.listClips>> = await q.listClips({ cursor, limit: 2 });
      seen.push(...page.clips.map((c) => c.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    const order = mine(seen.map((id) => ({ id })));
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("e")).toBeLessThan(order.indexOf("h"));
  });

  it("filters by tag and ignores unknown tags", async () => {
    expect(mine((await q.listClips({ tag: "kraken", limit: 60 })).clips)).toEqual(["b", "d"]);
    const unknown = await q.listClips({ tag: "not-a-tag", limit: 60 });
    expect(mine(unknown.clips)).toContain("a");
  });

  it("ignores a tampered cursor", async () => {
    expect(q.decodeCursor("garbage")).toBeNull();
    expect(
      q.decodeCursor(Buffer.from("2026-01-01T00:00:00Z|1 or 1=1").toString("base64url")),
    ).toBeNull();
  });

  it("gets a published clip, and nothing for pending, rejected or bad ids", async () => {
    expect((await q.getClip(ids.a!))?.title).toBe("a");
    expect(await q.getClip(ids.f!)).toBeNull();
    expect(await q.getClip(ids.g!)).toBeNull();
    expect(await q.getClip("not-a-uuid")).toBeNull();
  });

  it("puts same-channel and same-tag clips first in related", async () => {
    const a = (await q.getClip(ids.a!))!;
    const related = mine(await q.relatedClips(a, 6));
    expect(related[0]).toBe("c");
    expect(related).not.toContain("a");
    expect(related).not.toContain("f");
    const b = (await q.getClip(ids.b!))!;
    expect(mine(await q.relatedClips(b, 1))).toEqual(["d"]);
  });

  describe("sections", () => {
    afterAll(async () => {
      for (const name of ["a", "b", "c", "f"]) {
        for (const period of ["", isoWeek(now), previousWeek(isoWeek(now))!]) {
          await q.removeFromSection(ids[name]!, "weekly", period);
          await q.removeFromSection(ids[name]!, "featured", period);
        }
      }
    });

    it("has the seeded sections in order", async () => {
      expect((await q.listSections()).map((s) => s.slug).slice(0, 3)).toEqual([
        "weekly",
        "best-of",
        "featured",
      ]);
      expect(await q.getSectionPage("nope", now)).toBeNull();
    });

    it("shows curated picks by position and hides unpublished ones", async () => {
      await q.addToSection(ids.c!, "featured", { position: 2 });
      await q.addToSection(ids.b!, "featured", { position: 1 });
      await q.addToSection(ids.f!, "featured", { position: 0 });
      const page = (await q.getSectionPage("featured", now))!;
      expect(mine(page.clips)).toEqual(["b", "c"]);
      expect(page).toMatchObject({ period: null, fallback: false });
      expect(mine(await q.sectionsOf(ids.b!).then(() => page.clips))).toContain("b");
      expect((await q.sectionsOf(ids.b!)).map((s) => s.slug)).toEqual(["featured"]);
    });

    it("falls back to last week's picks, then to the newest week of clips", async () => {
      const fallback = (await q.getSectionPage("weekly", now))!;
      if (fallback.fallback) {
        expect(fallback.period).toBe("2026-W46");
        const names = mine(fallback.clips);
        expect(names).toEqual(expect.arrayContaining(["a", "b", "c", "d", "e"]));
        expect(names).not.toContain("h"); // 10 days old
      }

      await q.addToSection(ids.c!, "weekly", { period: previousWeek(isoWeek(now))! });
      const lastWeek = (await q.getSectionPage("weekly", now))!;
      expect(lastWeek).toMatchObject({ period: "2026-W45", fallback: false });
      expect(mine(lastWeek.clips)).toEqual(["c"]);

      await q.addToSection(ids.a!, "weekly", { period: isoWeek(now) });
      const thisWeek = (await q.getSectionPage("weekly", now))!;
      expect(thisWeek).toMatchObject({ period: "2026-W46", fallback: false });
      expect(mine(thisWeek.clips)).toEqual(["a"]);
    });

    it("re-adding a clip updates its position instead of failing", async () => {
      await q.addToSection(ids.b!, "featured", { position: 9 });
      const page = (await q.getSectionPage("featured", now))!;
      expect(mine(page.clips)).toEqual(["c", "b"]);
    });
  });
});
