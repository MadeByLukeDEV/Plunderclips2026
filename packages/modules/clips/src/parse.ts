export const PLATFORMS = ["twitch", "youtube", "kick", "medal", "tiktok", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** clip: a platform clip · video: VOD/upload · short: YouTube Short · live: YouTube live · post: X post */
export type ClipKind = "clip" | "video" | "short" | "live" | "post";

export type ParsedClip = {
  platform: Platform;
  kind: ClipKind;
  /** Platform id: Twitch clip slug or VOD number, YouTube video/clip id, Kick clip id or video uuid, … */
  id: string;
  /** Channel or account handle when the URL carries one (lowercase where the platform is case-insensitive). */
  channel?: string;
  /** Game slug from the URL, when the platform puts it there (Medal). */
  gameHint?: string;
  startSeconds?: number;
  /** Rebuilt from the parsed parts: known host, no tracking params. Safe to fetch. */
  canonicalUrl: string;
  /** Stable duplicate key, e.g. "youtube:video:dQw4w9WgXcQ". A Short and its watch URL share a key. */
  key: string;
  /** A short link (TikTok vm./vt./t/) that has to be followed before it has a real id: use resolveClipUrl. */
  needsResolve?: boolean;
};

export type ParseError = "invalid_url" | "unsupported_platform" | "unsupported_url";
export type ParseResult = { ok: true; clip: ParsedClip } | { ok: false; error: ParseError };

const MAX_URL_LENGTH = 2048;

/** Turns a pasted clip URL into platform + id. Pure and synchronous: no network. */
export function parseClipUrl(input: string): ParseResult {
  const url = toUrl(input);
  if (!url) return { ok: false, error: "invalid_url" };

  const host = baseHost(url.hostname);
  const parts = url.pathname.split("/").filter(Boolean);
  const q = url.searchParams;

  let clip: Omit<ParsedClip, "key"> | null;
  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) clip = twitch(host, parts, q);
  else if (YOUTUBE_HOSTS.has(host)) clip = youtube(host, parts, q);
  else if (host === "kick.com") clip = kick(parts, q);
  else if (host === "medal.tv") clip = medal(parts, q);
  else if (TIKTOK_HOSTS.has(host)) clip = tiktok(host, parts);
  else if (X_HOSTS.has(host)) clip = x(parts);
  else return { ok: false, error: "unsupported_platform" };

  if (!clip) return { ok: false, error: "unsupported_url" };
  return { ok: true, clip: { ...clip, key: keyOf(clip) } };
}

function keyOf(c: Omit<ParsedClip, "key">): string {
  // Shorts and live streams are ordinary videos once they are on YouTube.
  const kind = c.platform === "youtube" && c.kind !== "clip" ? "video" : c.kind;
  return `${c.platform}:${kind}:${c.id}`;
}

function toUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw || raw.length > MAX_URL_LENGTH || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  return url;
}

/** Lowercase host without www./m./mobile. prefixes. */
function baseHost(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^(?:www|m|mobile)\./, "");
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/;

/** "90", "90s", "1m30s", "1h2m3s" → seconds. */
export function parseTimestamp(v: string | null): number | undefined {
  if (!v) return undefined;
  if (/^\d+s?$/.test(v)) return Number.parseInt(v, 10) || undefined;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (!m || !(m[1] || m[2] || m[3])) return undefined;
  const s = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return s || undefined;
}

function twitchTime(s: number): string {
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m${s % 60}s`;
}

// --- Twitch ---------------------------------------------------------------

const TWITCH_CHANNEL = /^[A-Za-z0-9_]{1,25}$/;
const TWITCH_RESERVED = new Set(["videos", "directory", "settings", "p", "search", "downloads"]);

function twitch(host: string, parts: string[], q: URLSearchParams) {
  const clipOf = (slug: string | undefined, channel?: string) =>
    slug && SLUG.test(slug)
      ? {
          platform: "twitch" as const,
          kind: "clip" as const,
          id: slug,
          ...(channel ? { channel: channel.toLowerCase() } : {}),
          canonicalUrl: `https://clips.twitch.tv/${slug}`,
        }
      : null;
  const videoOf = (id: string | undefined | null) => {
    const vid = id?.replace(/^v/, "");
    if (!vid || !/^\d{5,15}$/.test(vid)) return null;
    const startSeconds = parseTimestamp(q.get("t") ?? q.get("time"));
    return {
      platform: "twitch" as const,
      kind: "video" as const,
      id: vid,
      ...(startSeconds ? { startSeconds } : {}),
      canonicalUrl: `https://www.twitch.tv/videos/${vid}${startSeconds ? `?t=${twitchTime(startSeconds)}` : ""}`,
    };
  };

  if (host === "clips.twitch.tv") {
    if (parts[0] === "embed") return clipOf(q.get("clip") ?? undefined);
    return parts.length === 1 ? clipOf(parts[0]) : null;
  }
  if (host === "player.twitch.tv") {
    if (q.get("clip")) return clipOf(q.get("clip") ?? undefined);
    return videoOf(q.get("video"));
  }
  if (host !== "twitch.tv") return null;

  if (parts[0] === "videos" && parts.length === 2) return videoOf(parts[1]);
  if (parts[0] === "clip" && parts.length === 2) return clipOf(parts[1]);
  const [channel, section, id] = parts;
  if (
    parts.length === 3 &&
    channel &&
    TWITCH_CHANNEL.test(channel) &&
    !TWITCH_RESERVED.has(channel.toLowerCase())
  ) {
    if (section === "clip") return clipOf(id, channel);
    if (section === "v" || section === "video") return videoOf(id);
  }
  return null;
}

// --- YouTube --------------------------------------------------------------

const YOUTUBE_HOSTS = new Set(["youtube.com", "youtu.be", "youtube-nocookie.com"]);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_CLIP_ID = /^Ug[A-Za-z0-9_-]{20,40}$/;

function youtube(host: string, parts: string[], q: URLSearchParams) {
  const startSeconds = parseTimestamp(q.get("t") ?? q.get("start"));
  const video = (id: string | undefined | null, kind: "video" | "short" | "live") => {
    if (!id || !YT_ID.test(id)) return null;
    const t = kind === "short" ? undefined : startSeconds;
    return {
      platform: "youtube" as const,
      kind,
      id,
      ...(t ? { startSeconds: t } : {}),
      canonicalUrl:
        kind === "short"
          ? `https://www.youtube.com/shorts/${id}`
          : `https://www.youtube.com/watch?v=${id}${t ? `&t=${t}s` : ""}`,
    };
  };

  if (host === "youtu.be") return parts.length === 1 ? video(parts[0], "video") : null;

  const [first, second] = parts;
  if (first === "watch" && parts.length === 1) return video(q.get("v"), "video");
  if (parts.length !== 2) return null;
  switch (first) {
    case "shorts":
      return video(second, "short");
    case "live":
      return video(second, "live");
    case "embed":
    case "v":
    case "e":
      return video(second, "video");
    case "clip":
      return second && YT_CLIP_ID.test(second)
        ? {
            platform: "youtube" as const,
            kind: "clip" as const,
            id: second,
            canonicalUrl: `https://www.youtube.com/clip/${second}`,
          }
        : null;
    default:
      return null;
  }
}

// --- Kick -----------------------------------------------------------------

const KICK_CHANNEL = /^[A-Za-z0-9_-]{1,40}$/;
const KICK_CLIP = /^clip_[A-Za-z0-9]{10,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function kick(parts: string[], q: URLSearchParams) {
  const clip = (id: string | undefined | null, channel: string | undefined) =>
    id && KICK_CLIP.test(id) && channel && KICK_CHANNEL.test(channel)
      ? {
          platform: "kick" as const,
          kind: "clip" as const,
          id,
          channel: channel.toLowerCase(),
          canonicalUrl: `https://kick.com/${channel.toLowerCase()}/clips/${id}`,
        }
      : null;
  const video = (id: string | undefined, channel?: string) =>
    id && UUID.test(id)
      ? {
          platform: "kick" as const,
          kind: "video" as const,
          id: id.toLowerCase(),
          ...(channel ? { channel: channel.toLowerCase() } : {}),
          canonicalUrl: channel
            ? `https://kick.com/${channel.toLowerCase()}/videos/${id.toLowerCase()}`
            : `https://kick.com/video/${id.toLowerCase()}`,
        }
      : null;

  const [first, second, third] = parts;
  if (parts.length === 1 && q.get("clip")) return clip(q.get("clip"), first);
  if (parts.length === 3 && second === "clips") return clip(third, first);
  if (parts.length === 3 && second === "videos" && first && KICK_CHANNEL.test(first))
    return video(third, first);
  if (parts.length === 2 && first === "video") return video(second);
  return null;
}

// --- Medal ----------------------------------------------------------------

const MEDAL_ID = /^[A-Za-z0-9_-]{5,40}$/;
const MEDAL_GAME = /^[a-z0-9-]{1,60}$/;

function medal(parts: string[], q: URLSearchParams) {
  const of = (id: string | undefined | null, gameHint?: string) =>
    id && MEDAL_ID.test(id)
      ? {
          platform: "medal" as const,
          kind: "clip" as const,
          id,
          ...(gameHint && MEDAL_GAME.test(gameHint) ? { gameHint } : {}),
          canonicalUrl: `https://medal.tv/clips/${id}`,
        }
      : null;

  const contentId = q.get("contentId");
  if (contentId) return of(contentId);
  const [first, second, third, fourth] = parts;
  // /games/<game>/clips/<id>[/<slug>]
  if (first === "games" && (third === "clips" || third === "clip")) return of(fourth, second);
  // /clips/<id>[/<slug>]
  if (first === "clips" || first === "clip") return of(second);
  return null;
}

// --- TikTok ---------------------------------------------------------------

const TIKTOK_HOSTS = new Set(["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);
const TIKTOK_ID = /^\d{15,25}$/;
const TIKTOK_USER = /^@[A-Za-z0-9_.]{1,30}$/;
const TIKTOK_SHORT = /^[A-Za-z0-9]{5,20}$/;

function tiktok(host: string, parts: string[]) {
  const shortLink = (code: string | undefined) =>
    code && TIKTOK_SHORT.test(code)
      ? {
          platform: "tiktok" as const,
          kind: "video" as const,
          id: code,
          needsResolve: true,
          canonicalUrl: `https://${host === "tiktok.com" ? "www.tiktok.com/t" : host}/${code}`,
        }
      : null;
  const video = (id: string | undefined, user?: string) =>
    id && TIKTOK_ID.test(id)
      ? {
          platform: "tiktok" as const,
          kind: "video" as const,
          id,
          ...(user ? { channel: user.slice(1).toLowerCase() } : {}),
          canonicalUrl: user
            ? `https://www.tiktok.com/${user.toLowerCase()}/video/${id}`
            : `https://www.tiktok.com/embed/v2/${id}`,
        }
      : null;

  if (host !== "tiktok.com") return parts.length === 1 ? shortLink(parts[0]) : null;
  const [first, second, third] = parts;
  if (first === "t" && parts.length === 2) return shortLink(second);
  if (first && TIKTOK_USER.test(first) && second === "video" && parts.length === 3)
    return video(third, first);
  if (first === "embed" && second === "v2" && parts.length === 3) return video(third);
  if (first === "embed" && parts.length === 2) return video(second);
  if (first === "player" && second === "v1" && parts.length === 3) return video(third);
  return null;
}

// --- X / Twitter ----------------------------------------------------------

// fxtwitter and friends are embed-fix mirrors people paste in Discord; they point at the same post.
const X_HOSTS = new Set([
  "x.com",
  "twitter.com",
  "fxtwitter.com",
  "vxtwitter.com",
  "fixupx.com",
  "fixvx.com",
]);
const X_ID = /^\d{1,20}$/;
const X_USER = /^[A-Za-z0-9_]{1,15}$/;

function x(parts: string[]) {
  const post = (id: string | undefined, user?: string) =>
    id && X_ID.test(id)
      ? {
          platform: "x" as const,
          kind: "post" as const,
          id,
          ...(user ? { channel: user.toLowerCase() } : {}),
          canonicalUrl: `https://x.com/${user ?? "i"}/status/${id}`,
        }
      : null;

  const [first, second, third, fourth] = parts;
  if (first === "i" && second === "web" && third === "status") return post(fourth);
  if (first === "i" && second === "status") return post(third);
  // /<user>/status/<id>[/video/1|/photo/1]
  if (first && X_USER.test(first) && (second === "status" || second === "statuses")) {
    const rest = parts.slice(3);
    if (rest.length === 0 || (rest.length === 2 && /^(video|photo)$/.test(rest[0]!)))
      return post(third, first);
  }
  return null;
}
