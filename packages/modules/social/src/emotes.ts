import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { env, logger, redis } from "@plunderclips/shared";

const { account, chatChannel, chatParticipant, crew, crewMember } = schema;

export type EmoteProvider = "7tv" | "bttv";

/** One emote as the chat shows it: typed as `code`, drawn from `url`. */
export type Emote = { code: string; url: string; provider: EmoteProvider; animated: boolean };

/**
 * What a channel can use, in the order a code is looked up: the crew's attached 7TV set and the
 * members' own Twitch channel emotes, then the site's 7TV sets, then the 7TV and BTTV globals.
 */
export type EmoteSets = {
  channel: Emote[];
  /** SEVENTV_EMOTE_SETS: sets the site keeps on 7tv.app for every chat. */
  site: Emote[];
  global: Emote[];
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** IDs from either service; anything else never becomes a URL. */
const ID = /^[0-9A-Za-z]{10,40}$/;
/** Emote codes are single words of ordinary characters, 1-40 long. */
const CODE = /^[\p{L}\p{N}_:()<>!?.'-]{1,40}$/u;
const TWITCH_ID = /^[0-9]{1,20}$/;
/** 7TV emote set IDs are ULIDs (26 chars of Crockford base32). */
const SET_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

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

/**
 * A 7TV emote set from what someone pasted: a set link (7tv.app/emote-sets/<id>) or the bare id.
 * null if it doesn't look like one.
 */
export function parseSevenTvSetRef(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const fromUrl = v.match(
    /^(?:https?:\/\/)?(?:www\.)?7tv\.app\/emote-sets\/([0-9A-Za-z]{26})\/?(?:[?#].*)?$/,
  );
  const id = (fromUrl?.[1] ?? v).toUpperCase();
  return SET_ID.test(id) ? id : null;
}

/** One 7TV emote set by id; empty if it doesn't exist or 7TV is down. */
export function sevenTvSet(id: string, fetchImpl: FetchLike = fetch): Promise<Emote[]> {
  if (!SET_ID.test(id)) return Promise.resolve([]);
  return cached(`emotes:7tvset:v1:${id}`, USER_TTL, async () =>
    parse7tv(await getJson(`https://7tv.io/v3/emote-sets/${id}`, fetchImpl)),
  );
}

/** Whether a 7TV set exists, checked live (for saving it on a crew). */
export async function sevenTvSetExists(id: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  if (!SET_ID.test(id)) return false;
  try {
    const set = await getJson(`https://7tv.io/v3/emote-sets/${id}`, fetchImpl);
    return !!set && typeof (set as { id?: unknown }).id === "string";
  } catch {
    return false;
  }
}

function siteSetIds(): string[] {
  return (env().SEVENTV_EMOTE_SETS ?? "")
    .split(",")
    .map((s) => parseSevenTvSetRef(s))
    .filter((s): s is string => !!s)
    .slice(0, 10);
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

async function channelMembers(
  channelId: string,
): Promise<{ members: string[]; crewSetId: string | null }> {
  const [ch] = await db()
    .select({ kind: chatChannel.kind, crewId: chatChannel.crewId, setId: crew.sevenTvSetId })
    .from(chatChannel)
    .leftJoin(crew, eq(crew.id, chatChannel.crewId))
    .where(eq(chatChannel.id, channelId));
  if (!ch) return { members: [], crewSetId: null };
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
  return { members: rows.map((r) => r.u), crewSetId: ch.setId };
}

/** Dedupes by code; earlier wins. */
function uniq(list: Emote[]): Emote[] {
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.code) ? false : (seen.add(e.code), true)));
}

/**
 * The emotes a channel can use. Closer sets win a shared code: the crew's set and the members'
 * channel emotes over the site's sets, and those over the globals, like a streamer's own Twitch
 * chat. Callers check access first.
 */
export async function emotesForChannel(
  channelId: string,
  fetchImpl: FetchLike = fetch,
): Promise<EmoteSets> {
  const { members, crewSetId } = await channelMembers(channelId);
  const ids = await twitchIds(members);
  const [global, site, crewSet, ...perMember] = await Promise.all([
    globalEmotes(fetchImpl),
    Promise.all(siteSetIds().map((id) => sevenTvSet(id, fetchImpl))).then((l) => l.flat()),
    crewSetId ? sevenTvSet(crewSetId, fetchImpl) : Promise.resolve([]),
    ...ids.slice(0, 50).map((id) => twitchChannelEmotes(id, fetchImpl)),
  ]);
  const taken = new Set<string>();
  const take = (list: Emote[], max: number) =>
    uniq(list)
      .filter((e) => (taken.has(e.code) ? false : (taken.add(e.code), true)))
      .slice(0, max);
  const channel = take([...crewSet!, ...perMember.flat()], 2000);
  return { channel, site: take(site!, 2000), global: take(global!, 2000) };
}
