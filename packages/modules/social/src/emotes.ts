import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { logger, redis } from "@plunderclips/shared";

const { account, chatChannel, chatParticipant, crewMember } = schema;

export type EmoteProvider = "7tv" | "bttv";

/** One emote as the chat shows it: typed as `code`, drawn from `url`. */
export type Emote = { code: string; url: string; provider: EmoteProvider; animated: boolean };

/** What a channel can use: global sets, then each member's own channel emotes. */
export type EmoteSets = {
  global: Emote[];
  /** Emotes from the members' own Twitch channels (7TV and BTTV), by code. */
  channel: Emote[];
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** IDs from either service; anything else never becomes a URL. */
const ID = /^[0-9A-Za-z]{10,40}$/;
/** Emote codes are single words of ordinary characters, 1-40 long. */
const CODE = /^[\p{L}\p{N}_:()<>!?.'-]{1,40}$/u;
const TWITCH_ID = /^[0-9]{1,20}$/;

const GLOBAL_TTL = 6 * 60 * 60;
const USER_TTL = 60 * 60;
const MAX_PER_SET = 1000;

const sevenTvUrl = (id: string) => `https://cdn.7tv.app/emote/${id}/2x.webp`;
const bttvUrl = (id: string) => `https://cdn.betterttv.net/emote/${id}/2x.webp`;

type SevenTvEmote = {
  id?: unknown;
  name?: unknown;
  data?: { listed?: unknown; animated?: unknown };
};

/** A 7TV emote set's emotes, leaving out unlisted ones (7TV hides those from its own directory). */
export function parse7tv(set: unknown): Emote[] {
  const emotes = (set as { emotes?: SevenTvEmote[] } | null)?.emotes;
  if (!Array.isArray(emotes)) return [];
  const out: Emote[] = [];
  for (const e of emotes.slice(0, MAX_PER_SET)) {
    if (typeof e?.id !== "string" || typeof e.name !== "string") continue;
    if (!ID.test(e.id) || !CODE.test(e.name) || e.data?.listed === false) continue;
    out.push({
      code: e.name,
      url: sevenTvUrl(e.id),
      provider: "7tv",
      animated: e.data?.animated === true,
    });
  }
  return out;
}

type BttvEmote = { id?: unknown; code?: unknown; animated?: unknown; modifier?: unknown };

/** BTTV emotes, leaving out modifiers (they only change the emote before them). */
export function parseBttv(list: unknown): Emote[] {
  if (!Array.isArray(list)) return [];
  const out: Emote[] = [];
  for (const e of (list as BttvEmote[]).slice(0, MAX_PER_SET)) {
    if (typeof e?.id !== "string" || typeof e.code !== "string") continue;
    if (!ID.test(e.id) || !CODE.test(e.code) || e.modifier === true) continue;
    out.push({ code: e.code, url: bttvUrl(e.id), provider: "bttv", animated: e.animated === true });
  }
  return out;
}

async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown | null> {
  try {
    const res = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "plunderclips (+chat emotes)" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    logger.warn("emote fetch failed", { url, error: String(err) });
    throw err;
  }
}

/** Redis-cached loader. A failed fetch isn't cached, so the next page view tries again. */
async function cached(key: string, ttl: number, load: () => Promise<Emote[]>): Promise<Emote[]> {
  try {
    const hit = await redis().get(key);
    if (hit) return JSON.parse(hit) as Emote[];
  } catch {
    // Redis down: load live.
  }
  try {
    const emotes = await load();
    await redis()
      .set(key, JSON.stringify(emotes), "EX", ttl)
      .catch(() => {});
    return emotes;
  } catch {
    return [];
  }
}

export function globalEmotes(fetchImpl: FetchLike = fetch): Promise<Emote[]> {
  return cached("emotes:global:v1", GLOBAL_TTL, async () => {
    const [seven, bttv] = await Promise.all([
      getJson("https://7tv.io/v3/emote-sets/global", fetchImpl),
      getJson("https://api.betterttv.net/3/cached/emotes/global", fetchImpl),
    ]);
    return [...parse7tv(seven), ...parseBttv(bttv)];
  });
}

/** One Twitch channel's 7TV set and BTTV channel and shared emotes. */
export function twitchChannelEmotes(
  twitchId: string,
  fetchImpl: FetchLike = fetch,
): Promise<Emote[]> {
  if (!TWITCH_ID.test(twitchId)) return Promise.resolve([]);
  return cached(`emotes:twitch:v1:${twitchId}`, USER_TTL, async () => {
    const [seven, bttv] = await Promise.all([
      getJson(`https://7tv.io/v3/users/twitch/${twitchId}`, fetchImpl),
      getJson(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`, fetchImpl),
    ]);
    const b = bttv as { channelEmotes?: unknown[]; sharedEmotes?: unknown[] } | null;
    return [
      ...parse7tv((seven as { emote_set?: unknown } | null)?.emote_set),
      ...parseBttv([...(b?.channelEmotes ?? []), ...(b?.sharedEmotes ?? [])]),
    ];
  });
}

/** Twitch user IDs of members who signed in with or linked Twitch. */
async function twitchIds(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const rows = await db()
    .select({ id: account.accountId })
    .from(account)
    .where(and(eq(account.providerId, "twitch"), inArray(account.userId, userIds)));
  return [...new Set(rows.map((r) => r.id))];
}

async function channelMembers(channelId: string): Promise<string[]> {
  const [ch] = await db()
    .select({ kind: chatChannel.kind, crewId: chatChannel.crewId })
    .from(chatChannel)
    .where(eq(chatChannel.id, channelId));
  if (!ch) return [];
  const rows =
    ch.kind === "crew" && ch.crewId
      ? await db()
          .select({ u: crewMember.userId })
          .from(crewMember)
          .where(eq(crewMember.crewId, ch.crewId))
      : await db()
          .select({ u: chatParticipant.userId })
          .from(chatParticipant)
          .where(eq(chatParticipant.channelId, channelId));
  return rows.map((r) => r.u);
}

/** Dedupes by code; earlier wins. */
function uniq(list: Emote[]): Emote[] {
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.code) ? false : (seen.add(e.code), true)));
}

/**
 * The emotes a channel can use. Members' channel emotes win over global ones with the same code,
 * like in a streamer's own Twitch chat. Callers check access first.
 */
export async function emotesForChannel(
  channelId: string,
  fetchImpl: FetchLike = fetch,
): Promise<EmoteSets> {
  const ids = await twitchIds(await channelMembers(channelId));
  const [global, ...perMember] = await Promise.all([
    globalEmotes(fetchImpl),
    ...ids.slice(0, 50).map((id) => twitchChannelEmotes(id, fetchImpl)),
  ]);
  const channel = uniq(perMember.flat()).slice(0, 2000);
  const taken = new Set(channel.map((e) => e.code));
  return { channel, global: uniq(global!).filter((e) => !taken.has(e.code)) };
}
