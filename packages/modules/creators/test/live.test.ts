import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Live polling against Postgres + Redis, with a fake Twitch and Kick. */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("live status (Postgres + Redis)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    TWITCH_CLIENT_ID: "test-twitch-id",
    TWITCH_CLIENT_SECRET: "test-twitch-secret",
    KICK_CLIENT_ID: "test-kick-id",
    KICK_CLIENT_SECRET: "test-kick-secret",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { like } = await import("drizzle-orm");
  const { redis } = await import("@plunderclips/shared");
  const live = await import("../src/live");

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uid = (x: string) => `test-${run}-${x}`;
  const tw = `t${run}tw`.slice(0, 25);
  const kk = `t${run}kk`.slice(0, 25);
  const quiet = `t${run}q`.slice(0, 25);

  beforeAll(async () => {
    await redis().del("creators:live:v1", "clips:twitch:app-token", "creators:kick:app-token");
    for (const [x, channels] of [
      [
        "sailor",
        [
          ["twitch", tw],
          ["kick", kk],
        ],
      ],
      ["quiet", [["twitch", quiet]]],
    ] as const) {
      await db()
        .insert(schema.user)
        .values({ id: uid(x), name: x, email: `${uid(x)}@example.test`, updatedAt: new Date() });
      await db()
        .insert(schema.creatorProfile)
        .values({
          userId: uid(x),
          handle: `t${run}${x}`.slice(0, 24),
          displayName: x.toUpperCase(),
        });
      for (const [platform, handle] of channels)
        await db()
          .insert(schema.creatorChannel)
          .values({ userId: uid(x), platform, handle });
    }
  });

  afterAll(async () => {
    await db()
      .delete(schema.user)
      .where(like(schema.user.id, `test-${run}-%`));
    await redis().del("creators:live:v1", "clips:twitch:app-token", "creators:kick:app-token");
  });

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  let kickDown = false;
  const calls: string[] = [];
  const fake = async (u: string) => {
    calls.push(u);
    if (u.startsWith("https://id.twitch.tv/oauth2/token"))
      return json({ access_token: "tw-token", expires_in: 3600 });
    if (u.startsWith("https://id.kick.com/oauth/token"))
      return json({ access_token: "kick-token", expires_in: 3600 });
    if (u.startsWith("https://api.twitch.tv/helix/streams"))
      return json({
        data: [
          {
            user_login: tw.toUpperCase(),
            type: "live",
            title: "Hourglass grind",
            game_name: "Sea of Thieves",
            viewer_count: 321,
            started_at: "2026-11-18T18:00:00Z",
          },
        ],
      });
    if (u.startsWith("https://api.kick.com/public/v1/channels")) {
      if (kickDown) return json({ message: "boom" }, 500);
      return json({
        data: [
          {
            slug: kk,
            stream_title: "Chill fishing",
            category: { name: "Just Chatting" },
            stream: { is_live: true, viewer_count: 12, start_time: "2026-11-18T17:00:00Z" },
          },
        ],
      });
    }
    return json({}, 404);
  };

  it("stores who is live on Twitch and Kick, and whether it's Sea of Thieves", async () => {
    const r = await live.pollLive(fake);
    expect(r.checked).toBeGreaterThanOrEqual(3);
    const streams = await live.liveForChannels([
      { platform: "twitch", handle: tw },
      { platform: "kick", handle: kk },
      { platform: "twitch", handle: quiet },
      { platform: "youtube", handle: "nope" },
    ]);
    expect(streams).toEqual([
      expect.objectContaining({
        platform: "twitch",
        handle: tw,
        sot: true,
        viewers: 321,
        url: `https://www.twitch.tv/${tw}`,
      }),
      expect.objectContaining({ platform: "kick", handle: kk, sot: false, game: "Just Chatting" }),
    ]);
    // Several logins go in one request, never one request per channel.
    expect(calls.filter((c) => c.includes("helix/streams"))).toHaveLength(1);
    expect(calls.find((c) => c.includes("helix/streams"))).toContain(`user_login=${tw}`);
  });

  it("lists live creators once each, biggest stream first, Sea of Thieves only on request", async () => {
    const all = (await live.liveCreators()).filter((c) => c.userId.startsWith(`test-${run}`));
    expect(all.map((c) => [c.displayName, c.stream.platform])).toEqual([["SAILOR", "twitch"]]);
    const sot = (await live.liveCreators({ sotOnly: true })).filter((c) =>
      c.userId.startsWith(`test-${run}`),
    );
    expect(sot).toHaveLength(1);
  });

  it("keeps a platform's last known streams when its API fails", async () => {
    kickDown = true;
    await live.pollLive(fake);
    const streams = await live.liveForChannels([{ platform: "kick", handle: kk }]);
    expect(streams.map((s) => s.title)).toEqual(["Chill fishing"]);
  });
});
