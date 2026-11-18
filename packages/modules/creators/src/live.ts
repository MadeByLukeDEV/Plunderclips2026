import { and, eq, inArray, or, sql } from "drizzle-orm";
import { twitchAppAuth } from "@plunderclips/clips";
import { db, schema } from "@plunderclips/db";
import { env, logger, redis } from "@plunderclips/shared";

const { creatorChannel, creatorProfile, user } = schema;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type LivePlatform = "twitch" | "kick";

/** One live stream, as the last poll saw it. */
export type LiveStream = {
  platform: LivePlatform;
  /** Lowercase channel name (Twitch login, Kick slug), as stored on creator pages. */
  handle: string;
  title: string;
  game: string;
  /** Streaming Sea of Thieves right now. */
  sot: boolean;
  viewers: number;
  startedAt: string;
  url: string;
};

const KEY = "creators:live:v1";
/** Longer than two missed polls, so one failed poll doesn't flicker every badge off. */
const TTL_SECONDS = 5 * 60;
const SOT = "sea of thieves";

const key = (p: LivePlatform, h: string) => `${p}:${h.toLowerCase()}`;
const chunk = <T>(list: T[], n: number) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// --- Twitch -------------------------------------------------------------------------------

type TwitchStream = {
  user_login?: string;
  title?: string;
  game_name?: string;
  viewer_count?: number;
  started_at?: string;
  type?: string;
};

/** Live streams among these Twitch logins (Helix /streams, 100 per request). */
export async function twitchLive(
  logins: string[],
  fetchImpl: FetchLike = fetch,
): Promise<LiveStream[]> {
  if (!logins.length) return [];
  const auth = await twitchAppAuth(fetchImpl);
  if (!auth) return [];
  const out: LiveStream[] = [];
  for (const part of chunk(logins, 100)) {
    const q = part.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
    const res = await fetchImpl(`https://api.twitch.tv/helix/streams?first=100&${q}`, {
      headers: { "Client-Id": auth.clientId, Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`twitch streams: HTTP ${res.status}`);
    const json = (await res.json()) as { data?: TwitchStream[] };
    for (const s of json.data ?? []) {
      if (s.type !== "live" || !s.user_login) continue;
      out.push({
        platform: "twitch",
        handle: s.user_login.toLowerCase(),
        title: (s.title ?? "").slice(0, 200),
        game: (s.game_name ?? "").slice(0, 80),
        sot: (s.game_name ?? "").toLowerCase() === SOT,
        viewers: Math.max(0, Number(s.viewer_count ?? 0)),
        startedAt: s.started_at ?? new Date().toISOString(),
        url: `https://www.twitch.tv/${s.user_login.toLowerCase()}`,
      });
    }
  }
  return out;
}

// --- Kick ---------------------------------------------------------------------------------

const KICK_TOKEN = "creators:kick:app-token";

/** Kick app access token (client credentials), cached in Redis until shortly before it expires. */
async function kickToken(fetchImpl: FetchLike): Promise<string | null> {
  const e = env();
  if (!e.KICK_CLIENT_ID || !e.KICK_CLIENT_SECRET) return null;
  const cached = await redis()
    .get(KICK_TOKEN)
    .catch(() => null);
  if (cached) return cached;
  const res = await fetchImpl("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: e.KICK_CLIENT_ID,
      client_secret: e.KICK_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    logger.warn("kick app token request failed", { status: res.status });
    return null;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  const ttl = Math.max(60, Number(json.expires_in ?? 3600) - 300);
  await redis()
    .set(KICK_TOKEN, json.access_token, "EX", ttl)
    .catch(() => {});
  return json.access_token;
}

type KickChannel = {
  slug?: string;
  stream_title?: string;
  category?: { name?: string } | null;
  stream?: { is_live?: boolean; start_time?: string; viewer_count?: number } | null;
};

/** Live streams among these Kick channel slugs (/public/v1/channels, 50 per request). */
export async function kickLive(
  slugs: string[],
  fetchImpl: FetchLike = fetch,
): Promise<LiveStream[]> {
  const valid = slugs.filter((s) => /^[a-z0-9_-]{1,25}$/.test(s));
  if (!valid.length) return [];
  const token = await kickToken(fetchImpl);
  if (!token) return [];
  const out: LiveStream[] = [];
  for (const part of chunk(valid, 50)) {
    const q = part.map((s) => `slug=${encodeURIComponent(s)}`).join("&");
    const res = await fetchImpl(`https://api.kick.com/public/v1/channels?${q}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401)
      await redis()
        .del(KICK_TOKEN)
        .catch(() => {});
    if (!res.ok) throw new Error(`kick channels: HTTP ${res.status}`);
    const json = (await res.json()) as { data?: KickChannel[] };
    for (const c of json.data ?? []) {
      if (!c.slug || !c.stream?.is_live) continue;
      const game = c.category?.name ?? "";
      out.push({
        platform: "kick",
        handle: c.slug.toLowerCase(),
        title: (c.stream_title ?? "").slice(0, 200),
        game: game.slice(0, 80),
        sot: game.toLowerCase() === SOT,
        viewers: Math.max(0, Number(c.stream.viewer_count ?? 0)),
        startedAt: c.stream.start_time ?? new Date().toISOString(),
        url: `https://kick.com/${c.slug.toLowerCase()}`,
      });
    }
  }
  return out;
}

// --- Polling and reading ---------------------------------------------------------------------

/**
 * Checks every Twitch and Kick channel listed on a creator page and stores who is live. A
 * platform that fails keeps its last known streams until they expire, so a hiccup at Twitch
 * doesn't blank Kick (or the other way round). Run by the worker about once a minute.
 */
export async function pollLive(
  fetchImpl: FetchLike = fetch,
): Promise<{ live: number; checked: number }> {
  const rows = await db()
    .select({ platform: creatorChannel.platform, handle: creatorChannel.handle })
    .from(creatorChannel)
    .where(inArray(creatorChannel.platform, ["twitch", "kick"]));
  const logins = [...new Set(rows.filter((r) => r.platform === "twitch").map((r) => r.handle))];
  const slugs = [...new Set(rows.filter((r) => r.platform === "kick").map((r) => r.handle))];

  const previous = await readLive();
  const [tw, kk] = await Promise.allSettled([
    twitchLive(logins, fetchImpl),
    kickLive(slugs, fetchImpl),
  ]);
  const keep = (p: LivePlatform, r: PromiseSettledResult<LiveStream[]>) => {
    if (r.status === "fulfilled") return r.value;
    logger.warn("live poll failed", { platform: p, error: String(r.reason) });
    return Object.values(previous).filter((s) => s.platform === p);
  };
  const streams = [...keep("twitch", tw), ...keep("kick", kk)];
  const map = Object.fromEntries(streams.map((s) => [key(s.platform, s.handle), s]));
  await redis().set(KEY, JSON.stringify(map), "EX", TTL_SECONDS);
  return { live: streams.length, checked: logins.length + slugs.length };
}

async function readLive(): Promise<Record<string, LiveStream>> {
  try {
    const raw = await redis().get(KEY);
    return raw ? (JSON.parse(raw) as Record<string, LiveStream>) : {};
  } catch {
    return {};
  }
}

/** Live streams for one creator's channels (their Twitch and Kick, when live). */
export async function liveForChannels(
  channels: { platform: string; handle: string }[],
): Promise<LiveStream[]> {
  const live = await readLive();
  return channels
    .filter((c) => c.platform === "twitch" || c.platform === "kick")
    .map((c) => live[key(c.platform as LivePlatform, c.handle)])
    .filter((s): s is LiveStream => !!s);
}

export type LiveCreator = {
  userId: string;
  handle: string;
  displayName: string;
  image: string | null;
  stream: LiveStream;
};

/**
 * Creators live right now, most viewers first (one entry per creator, their biggest stream).
 * `sotOnly` keeps those streaming Sea of Thieves. Banned members are left out.
 */
export async function liveCreators(
  opts: { sotOnly?: boolean; limit?: number } = {},
): Promise<LiveCreator[]> {
  const live = Object.values(await readLive()).filter((s) => !opts.sotOnly || s.sot);
  if (!live.length) return [];
  const rows = await db()
    .select({
      userId: creatorProfile.userId,
      handle: creatorProfile.handle,
      displayName: creatorProfile.displayName,
      image: user.image,
      platform: creatorChannel.platform,
      channel: creatorChannel.handle,
    })
    .from(creatorChannel)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, creatorChannel.userId))
    .innerJoin(user, eq(user.id, creatorProfile.userId))
    .where(
      and(
        or(
          ...live.map((s) =>
            and(eq(creatorChannel.platform, s.platform), eq(creatorChannel.handle, s.handle)),
          ),
        ),
        or(eq(user.banned, false), sql`${user.banned} is null`),
      ),
    );
  const best = new Map<string, LiveCreator>();
  for (const r of rows) {
    const stream = live.find((s) => s.platform === r.platform && s.handle === r.channel);
    if (!stream) continue;
    const prev = best.get(r.userId);
    if (!prev || stream.viewers > prev.stream.viewers)
      best.set(r.userId, {
        userId: r.userId,
        handle: r.handle,
        displayName: r.displayName,
        image: r.image,
        stream,
      });
  }
  return [...best.values()]
    .sort((a, b) => b.stream.viewers - a.stream.viewers)
    .slice(0, Math.min(Math.max(opts.limit ?? 12, 1), 50));
}
