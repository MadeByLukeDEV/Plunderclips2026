import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Profiles, follows and clip matching against the local Postgres (pnpm dev:services + db:migrate).
 * Skipped without DATABASE_URL. Every user and clip it creates is deleted afterwards.
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("creator profiles (Postgres)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { eq, like } = await import("drizzle-orm");
  const p = await import("../src/profiles");
  const { authorUrls } = await import("../src/channels");
  const { listClipsByChannels } = await import("@plunderclips/clips");

  // Random suffix: test files run in parallel and must never share a prefix.
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uid = (n: string) => `test-${run}-${n}`;
  const h = (n: string) => `t${run}${n}`.slice(0, 24);

  beforeAll(async () => {
    for (const n of ["alice", "bob", "carol", "banned"])
      await db()
        .insert(schema.user)
        .values({
          id: uid(n),
          name: n,
          email: `${uid(n)}@example.test`,
          banned: n === "banned",
          updatedAt: new Date(),
        });
  });

  afterAll(async () => {
    await db()
      .delete(schema.clip)
      .where(like(schema.clip.key, `test:${run}:%`));
    await db()
      .delete(schema.user)
      .where(like(schema.user.id, `test-${run}-%`));
  });

  it("creates a profile with channels parsed from links", async () => {
    const r = await p.saveProfile(uid("alice"), {
      handle: h("alice"),
      displayName: "  Alice   the Bold ",
      bio: "Line one\r\n\r\n\r\n\r\nLine two",
      banner: "temeraire",
      channels: { twitch: "https://www.twitch.tv/AliceSails", x: "@AliceSails", kick: "" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previousHandle).toBeNull();
    expect(r.profile).toMatchObject({
      handle: h("alice"),
      displayName: "Alice the Bold",
      bio: "Line one\n\nLine two",
      banner: "temeraire",
      followerCount: 0,
      channels: [
        { platform: "twitch", handle: "alicesails" },
        { platform: "x", handle: "alicesails" },
      ],
    });
  });

  it("reports every invalid field at once", async () => {
    const r = await p.saveProfile(uid("bob"), {
      handle: "ad",
      displayName: " ",
      bio: "x".repeat(301),
      banner: "kraken.png",
      channels: { twitch: "has space", youtube: "https://www.youtube.com/channel/UC1" },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.field).sort()).toEqual(
      ["banner", "bio", "channel.twitch", "channel.youtube", "displayName", "handle"].sort(),
    );
  });

  it("refuses a handle someone else has, case-insensitively", async () => {
    const r = await p.saveProfile(uid("bob"), {
      handle: h("alice").toUpperCase(),
      displayName: "Bob",
    });
    expect(r).toEqual({ ok: false, errors: [{ field: "handle", error: "taken" }] });
  });

  it("renames, replaces channels, and reports the old handle", async () => {
    const first = await p.saveProfile(uid("bob"), {
      handle: h("bob"),
      displayName: "Bob",
      channels: { youtube: "@BobOnTheSea", tiktok: "@bob.sea" },
    });
    expect(first.ok).toBe(true);
    const second = await p.saveProfile(uid("bob"), {
      handle: h("bobby"),
      displayName: "Bobby",
      channels: { youtube: "@BobOnTheSea" },
    });
    expect(second.ok && second.previousHandle).toBe(h("bob"));
    expect(await p.getProfileByHandle(h("bob"))).toBeNull();
    const bobby = await p.getProfileByHandle(h("bobby"));
    expect(bobby?.channels).toEqual([{ platform: "youtube", handle: "bobonthesea" }]);
  });

  it("hides banned members' pages from the public but not from themselves", async () => {
    const r = await p.saveProfile(uid("banned"), { handle: h("banned"), displayName: "Banned" });
    expect(r.ok).toBe(true);
    expect(await p.getProfileByHandle(h("banned"))).toBeNull();
    expect((await p.getProfileByUser(uid("banned")))?.handle).toBe(h("banned"));
    const listed = await p.listProfiles({ limit: 100 });
    expect(listed.some((x) => x.userId === uid("banned"))).toBe(false);
  });

  describe("follows", () => {
    it("counts follows and unfollows, idempotently", async () => {
      expect(await p.setFollow(uid("bob"), uid("alice"), true)).toEqual({
        ok: true,
        following: true,
        followers: 1,
      });
      expect(await p.setFollow(uid("bob"), uid("alice"), true)).toMatchObject({ followers: 1 });
      expect(await p.setFollow(uid("carol"), uid("alice"), true)).toMatchObject({ followers: 2 });
      expect(await p.isFollowing(uid("bob"), uid("alice"))).toBe(true);
      expect(await p.setFollow(uid("bob"), uid("alice"), false)).toMatchObject({
        following: false,
        followers: 1,
      });
      expect(await p.isFollowing(uid("bob"), uid("alice"))).toBe(false);
      expect(await p.isFollowing(null, uid("alice"))).toBe(false);
    });

    it("refuses following yourself or someone without a page", async () => {
      expect(await p.setFollow(uid("alice"), uid("alice"), true)).toEqual({
        ok: false,
        error: "self",
      });
      expect(await p.setFollow(uid("alice"), uid("carol"), true)).toEqual({
        ok: false,
        error: "not_found",
      });
    });

    it("keeps the count right when a follower's account is deleted", async () => {
      await db()
        .insert(schema.user)
        .values({
          id: uid("temp"),
          name: "temp",
          email: `${uid("temp")}@example.test`,
          updatedAt: new Date(),
        });
      await p.setFollow(uid("temp"), uid("alice"), true);
      expect(await p.followerCount(uid("alice"))).toBe(2);
      await db()
        .delete(schema.user)
        .where(eq(schema.user.id, uid("temp")));
      expect(await p.followerCount(uid("alice"))).toBe(1);
    });

    it("lists who a member follows, newest follow first", async () => {
      await p.saveProfile(uid("carol"), { handle: h("carol"), displayName: "Carol" });
      await p.setFollow(uid("bob"), uid("alice"), true);
      await p.setFollow(uid("bob"), uid("carol"), true);
      const following = await p.listFollowing(uid("bob"));
      expect(following.map((x) => x.userId)).toEqual([uid("carol"), uid("alice")]);
      expect(await p.listFollowing(uid("alice"))).toEqual([]);
      await p.setFollow(uid("bob"), uid("alice"), false);
      await p.setFollow(uid("bob"), uid("carol"), false);
    });

    it("sorts the list by followers", async () => {
      const top = await p.listProfiles({ sort: "followers", limit: 100 });
      const mine = top.filter((x) => x.userId.startsWith(`test-${run}-`)).map((x) => x.userId);
      expect(mine[0]).toBe(uid("alice"));
    });
  });

  it("finds a creator's clips by channel or by the author URL the platform reported", async () => {
    const base = { kind: "clip" as const, status: "approved" as const, approvedAt: new Date() };
    await db()
      .insert(schema.clip)
      .values([
        // Twitch clip whose URL named the channel
        {
          ...base,
          key: `test:${run}:1`,
          platform: "twitch",
          platformId: "a",
          canonicalUrl: "https://clips.twitch.tv/a",
          title: "by channel",
          channel: "alicesails",
        },
        // Twitch clip without a channel in its URL, matched by Helix author URL
        {
          ...base,
          key: `test:${run}:2`,
          platform: "twitch",
          platformId: "b",
          canonicalUrl: "https://clips.twitch.tv/b",
          title: "by author",
          authorUrl: "https://www.twitch.tv/AliceSails",
        },
        // X post: oEmbed reported the old twitter.com URL
        {
          ...base,
          key: `test:${run}:3`,
          platform: "x",
          kind: "post",
          platformId: "1",
          canonicalUrl: "https://x.com/i/status/1",
          title: "tweet",
          authorUrl: "https://twitter.com/alicesails/",
        },
        // Same handle on another platform: not hers
        {
          ...base,
          key: `test:${run}:4`,
          platform: "kick",
          platformId: "c",
          canonicalUrl: "https://kick.com/x",
          title: "other platform",
          channel: "alicesails",
        },
        // Hers but not approved
        {
          ...base,
          key: `test:${run}:5`,
          platform: "twitch",
          platformId: "d",
          canonicalUrl: "https://clips.twitch.tv/d",
          title: "pending",
          channel: "alicesails",
          status: "pending",
        },
      ]);
    const alice = (await p.getProfileByHandle(h("alice")))!;
    const page = await listClipsByChannels(
      alice.channels.map((c) => ({ ...c, authorUrls: authorUrls(c) })),
    );
    expect(page.clips.map((c) => c.title).sort()).toEqual(["by author", "by channel", "tweet"]);
    expect((await listClipsByChannels([])).clips).toEqual([]);
  });
});
