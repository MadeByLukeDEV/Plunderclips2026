import { afterAll, describe, expect, it } from "vitest";
import { parse7tv, parseBttv, parseSevenTvSetRef } from "../src/emotes";

describe("emote parsing", () => {
  it("keeps listed 7TV emotes and builds the URL from the id only", () => {
    const set = {
      emotes: [
        {
          id: "01FCY771D800007PQ2DF3GDTN6",
          name: "RainTime",
          data: { listed: true, animated: true },
        },
        { id: "01FCY771D800007PQ2DF3GDTN7", name: "Hidden", data: { listed: false } },
        { id: "../../evil", name: "Bad", data: {} },
        { id: "01FCY771D800007PQ2DF3GDTN8", name: "has space", data: {} },
        { id: "01FCY771D800007PQ2DF3GDTN9", name: "<img>", data: {} },
      ],
    };
    expect(parse7tv(set)).toEqual([
      {
        code: "RainTime",
        url: "https://cdn.7tv.app/emote/01FCY771D800007PQ2DF3GDTN6/2x.webp",
        provider: "7tv",
        animated: true,
      },
      {
        code: "<img>",
        url: "https://cdn.7tv.app/emote/01FCY771D800007PQ2DF3GDTN9/2x.webp",
        provider: "7tv",
        animated: false,
      },
    ]);
    expect(parse7tv(null)).toEqual([]);
    expect(parse7tv({ emotes: "nope" })).toEqual([]);
  });

  it("skips BTTV modifiers and malformed rows", () => {
    expect(
      parseBttv([
        { id: "54fa8fce01e468494b85b53c", code: "CiGrip", animated: false },
        { id: "54fa8fce01e468494b85b53d", code: "w!", modifier: true },
        { id: 12, code: "x" },
        { id: "54fa8fce01e468494b85b53e", code: ":tf:" },
      ]).map((e) => [e.code, e.url]),
    ).toEqual([
      ["CiGrip", "https://cdn.betterttv.net/emote/54fa8fce01e468494b85b53c/2x.webp"],
      [":tf:", "https://cdn.betterttv.net/emote/54fa8fce01e468494b85b53e/2x.webp"],
    ]);
  });
});

describe("7TV set links", () => {
  it("takes a set link or a bare id, and nothing else", () => {
    const id = "01HKQT8EWR000ESSWF3625XCS4";
    expect(parseSevenTvSetRef(`https://7tv.app/emote-sets/${id}`)).toBe(id);
    expect(parseSevenTvSetRef(`7tv.app/emote-sets/${id.toLowerCase()}/`)).toBe(id);
    expect(parseSevenTvSetRef(`  ${id} `)).toBe(id);
    expect(parseSevenTvSetRef(`https://evil.example/emote-sets/${id}`)).toBeNull();
    expect(parseSevenTvSetRef("https://7tv.app/emote-sets/short")).toBeNull();
    expect(parseSevenTvSetRef("")).toBeNull();
  });
});

/** Per-channel sets against the local Postgres and Redis, with a fake 7TV/BTTV. */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("emotes for a channel (Postgres + Redis)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    SEVENTV_EMOTE_SETS: "01HSXTE0000000000000000001",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { like } = await import("drizzle-orm");
  const { redis } = await import("@plunderclips/shared");
  const crews = await import("../src/crews");
  const chat = await import("../src/chat");
  const { emotesForChannel } = await import("../src/emotes");

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uid = (n: string) => `test-${run}-${n}`;
  const twitchId = String(9_000_000_000 + Math.floor(Math.random() * 1e8));

  afterAll(async () => {
    await db()
      .delete(schema.crew)
      .where(like(schema.crew.slug, `t${run}%`));
    await db()
      .delete(schema.user)
      .where(like(schema.user.id, `test-${run}-%`));
    await redis().del(
      `emotes:twitch:v1:${twitchId}`,
      "emotes:global:v1",
      "emotes:7tvset:v1:01HSXTE0000000000000000001",
      "emotes:7tvset:v1:01HCREW0000000000000000001",
    );
  });

  it("merges the global sets with each member's Twitch emotes, theirs first", async () => {
    for (const n of ["streamer", "viewer"]) {
      await db()
        .insert(schema.user)
        .values({ id: uid(n), name: n, email: `${uid(n)}@example.test`, updatedAt: new Date() });
      await db()
        .insert(schema.creatorProfile)
        .values({ userId: uid(n), handle: `t${run}${n}`.slice(0, 24), displayName: n });
    }
    await db()
      .insert(schema.account)
      .values({
        id: `${uid("acct")}`,
        userId: uid("streamer"),
        providerId: "twitch",
        accountId: twitchId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    const r = await crews.createCrew(uid("streamer"), {
      slug: `t${run}crew`.slice(0, 24),
      name: "E",
      joinPolicy: "open",
    });
    if (!r.ok || !("crew" in r)) throw new Error("crew");
    await crews.joinCrew(uid("viewer"), r.crew.id);
    const channelId = await chat.crewChannelId(r.crew.id);

    const calls: string[] = [];
    const fake = async (u: string) => {
      calls.push(u);
      const body = u.endsWith("/emote-sets/01HSXTE0000000000000000001")
        ? {
            id: "01HSXTE0000000000000000001",
            emotes: [
              { id: "01HSITEEMOTE00000000000001", name: "Galleon", data: {} },
              { id: "01HSITEEMOTE00000000000002", name: "Sloop", data: {} },
            ],
          }
        : u.endsWith("/emote-sets/01HCREW0000000000000000001")
          ? {
              id: "01HCREW0000000000000000001",
              emotes: [{ id: "01HCREWEMOTE00000000000001", name: "Kraken", data: {} }],
            }
          : u.includes(`/users/twitch/${twitchId}`)
            ? u.includes("7tv")
              ? {
                  emote_set: {
                    emotes: [{ id: "01HCHANNEL0000000000000001", name: "Sloop", data: {} }],
                  },
                }
              : {
                  channelEmotes: [{ id: "64aaaaaaaaaaaaaaaaaaaaaa", code: "PogU" }],
                  sharedEmotes: [],
                }
            : u.includes("7tv")
              ? { emotes: [{ id: "01HGLOBAL00000000000000001", name: "PogU", data: {} }] }
              : [{ id: "64bbbbbbbbbbbbbbbbbbbbbb", code: "CiGrip" }];
      return new Response(JSON.stringify(body), { status: 200 });
    };

    // The captain attaches a crew set; a bad link and an unknown set are refused.
    expect(
      await crews.updateCrew(
        uid("streamer"),
        r.crew.id,
        { slug: r.crew.slug, name: "E", sevenTvSet: "nope" },
        fake,
      ),
    ).toEqual({ ok: false, errors: [{ field: "sevenTvSet", error: "invalid" }] });
    expect(
      await crews.updateCrew(
        uid("streamer"),
        r.crew.id,
        {
          slug: r.crew.slug,
          name: "E",
          sevenTvSet: "https://7tv.app/emote-sets/01HMXSSNG00000000000000001",
        },
        async () => new Response("{}", { status: 404 }),
      ),
    ).toEqual({ ok: false, errors: [{ field: "sevenTvSet", error: "not_found" }] });
    const saved = await crews.updateCrew(
      uid("streamer"),
      r.crew.id,
      {
        slug: r.crew.slug,
        name: "E",
        joinPolicy: "open",
        sevenTvSet: "https://7tv.app/emote-sets/01HCREW0000000000000000001",
      },
      fake,
    );
    expect(saved.ok && "crew" in saved && saved.crew.sevenTvSetId).toBe(
      "01HCREW0000000000000000001",
    );

    const sets = await emotesForChannel(channelId, fake);
    // Crew set first, then the streamer's own emotes.
    expect(sets.channel.map((e) => e.code)).toEqual(["Kraken", "Sloop", "PogU"]);
    // The site set keeps what the channel doesn't already have.
    expect(sets.site.map((e) => e.code)).toEqual(["Galleon"]);
    // The streamer's PogU wins over the global one with the same code.
    expect(sets.global.map((e) => e.code)).not.toContain("PogU");
    expect(calls.some((c) => c.includes(twitchId))).toBe(true);

    // Second load comes from Redis: no new calls for the streamer.
    const before = calls.filter((c) => c.includes(twitchId)).length;
    await emotesForChannel(channelId, fake);
    expect(calls.filter((c) => c.includes(twitchId)).length).toBe(before);
  });
});
