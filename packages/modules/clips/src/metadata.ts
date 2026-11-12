import { logger } from "@plunderclips/shared";
import { isAllowedEmbed } from "./embed";
import { getJson, getText, httpsUrl, str, type FetchLike, type GetOptions } from "./http";
import { readMetaTags, stripTags } from "./opengraph";
import { parseTimestamp, type ParsedClip } from "./parse";
import type { TwitchAuth } from "./twitch-token";

export type ClipMetadata = {
  title?: string;
  thumbnailUrl?: string;
  authorName?: string;
  authorUrl?: string;
  durationSeconds?: number;
  game?: string;
  /** true/false when the platform says which game it is, undefined when it doesn't (YouTube, TikTok, X). */
  isSeaOfThieves?: boolean;
  /** iframe src from the platform itself (YouTube clips, Kick, Medal). Host-checked. */
  embedSrc?: string;
  source: "api" | "oembed" | "opengraph";
};

export type MetadataOptions = {
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Twitch Helix credentials. Without them Twitch falls back to page meta tags. */
  twitchAuth?: () => Promise<TwitchAuth | null>;
};

/** Twitch's game id for Sea of Thieves. */
export const TWITCH_SEA_OF_THIEVES = "490377";
const SOT_NAME = "Sea of Thieves";
const SOT_SLUG = "sea-of-thieves";

/**
 * Title, thumbnail and author for a parsed clip, from oEmbed, the platform API or page meta tags.
 * Never throws: returns null when the platform gives nothing back (private, deleted, blocked).
 */
export async function fetchClipMetadata(
  clip: ParsedClip,
  opts: MetadataOptions = {},
): Promise<ClipMetadata | null> {
  if (clip.needsResolve) return null;
  const ctx: Ctx = {
    clip,
    fetch: opts.fetch ?? fetch,
    timeoutMs: opts.timeoutMs ?? 5000,
    twitchAuth: opts.twitchAuth ?? (async () => null),
  };
  try {
    switch (clip.platform) {
      case "youtube":
        return await youtube(ctx);
      case "twitch":
        return (
          (await twitchApi(ctx)) ?? (await openGraph(ctx, ["clips.twitch.tv", "www.twitch.tv"]))
        );
      case "kick":
        return (await kickApi(ctx)) ?? (await openGraph(ctx, ["kick.com"]));
      case "medal":
        return await openGraph(ctx, ["medal.tv"]);
      case "tiktok":
        return await tiktok(ctx);
      case "x":
        return await x(ctx);
    }
  } catch (err) {
    logger.warn("clip metadata fetch failed", {
      key: clip.key,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

type Ctx = {
  clip: ParsedClip;
  fetch: FetchLike;
  timeoutMs: number;
  twitchAuth: () => Promise<TwitchAuth | null>;
};

const opts = (c: Ctx, allowedHosts: string[], extra?: Partial<GetOptions>): GetOptions => ({
  fetch: c.fetch,
  timeoutMs: c.timeoutMs,
  allowedHosts,
  ...extra,
});

const enc = encodeURIComponent;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

function clean(m: ClipMetadata): ClipMetadata | null {
  const out = Object.fromEntries(
    Object.entries(m).filter(([, v]) => v !== undefined),
  ) as ClipMetadata;
  return out.title || out.thumbnailUrl ? out : null;
}

function iframeSrc(html: unknown): string | undefined {
  if (typeof html !== "string") return undefined;
  return /<iframe[^>]+src=["']([^"']+)["']/i.exec(html)?.[1];
}

// --- YouTube: oEmbed ------------------------------------------------------

async function youtube(c: Ctx) {
  const j = obj(
    await getJson(
      `https://www.youtube.com/oembed?format=json&url=${enc(c.clip.canonicalUrl)}`,
      opts(c, ["www.youtube.com"]),
    ),
  );
  let embedSrc: string | undefined;
  if (c.clip.kind === "clip") {
    const src = iframeSrc(j.html)?.replaceAll("&amp;", "&");
    if (src && isAllowedEmbed("youtube", src))
      embedSrc = src.replace("://www.youtube.com/", "://www.youtube-nocookie.com/");
  }
  return clean({
    title: str(j.title),
    thumbnailUrl: httpsUrl(j.thumbnail_url),
    authorName: str(j.author_name, 100),
    authorUrl: httpsUrl(j.author_url),
    embedSrc,
    source: "oembed",
  });
}

// --- Twitch: Helix --------------------------------------------------------

async function twitchApi(c: Ctx) {
  const auth = await c.twitchAuth();
  if (!auth) return null;
  const headers = { "client-id": auth.clientId, authorization: `Bearer ${auth.token}` };
  const path = c.clip.kind === "clip" ? "clips" : "videos";
  const j = obj(
    await getJson(
      `https://api.twitch.tv/helix/${path}?id=${enc(c.clip.id)}`,
      opts(c, ["api.twitch.tv"], { headers }),
    ),
  );
  const d = obj(Array.isArray(j.data) ? j.data[0] : undefined);
  if (!d.id) return null;

  if (c.clip.kind === "clip") {
    const broadcaster = str(d.broadcaster_name, 100);
    const gameId = typeof d.game_id === "string" && d.game_id ? d.game_id : undefined;
    return clean({
      title: str(d.title),
      thumbnailUrl: httpsUrl(d.thumbnail_url),
      authorName: broadcaster,
      authorUrl:
        broadcaster && /^[A-Za-z0-9_]+$/.test(broadcaster)
          ? `https://www.twitch.tv/${broadcaster.toLowerCase()}`
          : undefined,
      durationSeconds: typeof d.duration === "number" ? Math.round(d.duration) : undefined,
      game: gameId === TWITCH_SEA_OF_THIEVES ? SOT_NAME : undefined,
      isSeaOfThieves: gameId ? gameId === TWITCH_SEA_OF_THIEVES : undefined,
      source: "api",
    });
  }
  const login = str(d.user_login, 25);
  return clean({
    title: str(d.title),
    thumbnailUrl: httpsUrl(
      typeof d.thumbnail_url === "string"
        ? d.thumbnail_url.replace("%{width}", "640").replace("%{height}", "360")
        : undefined,
    ),
    authorName: str(d.user_name, 100),
    authorUrl: login ? `https://www.twitch.tv/${login}` : undefined,
    durationSeconds: typeof d.duration === "string" ? parseTimestamp(d.duration) : undefined,
    source: "api",
  });
}

// --- Kick: public API (often behind a bot wall), then page meta -----------

async function kickApi(c: Ctx) {
  if (c.clip.kind !== "clip") return null;
  const j = obj(
    await getJson(`https://kick.com/api/v2/clips/${enc(c.clip.id)}`, opts(c, ["kick.com"])),
  );
  const d = obj(j.clip ?? j);
  if (!d.id && !d.title) return null;
  const channel = obj(d.channel);
  const category = obj(d.category);
  const slug = str(channel.slug, 40);
  const categorySlug = str(category.slug, 60);
  return clean({
    title: str(d.title),
    thumbnailUrl: httpsUrl(d.thumbnail_url),
    authorName: str(channel.username, 100),
    authorUrl: slug ? `https://kick.com/${slug}` : undefined,
    durationSeconds: typeof d.duration === "number" ? Math.round(d.duration) : undefined,
    game: str(category.name, 100),
    isSeaOfThieves: categorySlug ? categorySlug === SOT_SLUG : undefined,
    source: "api",
  });
}

// --- Medal, plus fallback for Twitch and Kick: OpenGraph ------------------

async function openGraph(c: Ctx, hosts: string[]) {
  const html = await getText(c.clip.canonicalUrl, opts(c, hosts));
  if (!html) return null;
  const m = readMetaTags(html);
  const player =
    m.get("og:video:secure_url") ??
    m.get("og:video:url") ??
    m.get("og:video") ??
    m.get("twitter:player");
  const hint = c.clip.gameHint;
  return clean({
    title: str(m.get("og:title") ?? m.get("twitter:title")),
    thumbnailUrl: httpsUrl(m.get("og:image") ?? m.get("twitter:image")),
    authorName: str(m.get("og:video:actor") ?? m.get("author"), 100),
    embedSrc: player && isAllowedEmbed(c.clip.platform, player) ? player : undefined,
    game: hint === SOT_SLUG ? SOT_NAME : undefined,
    isSeaOfThieves: hint ? hint === SOT_SLUG : undefined,
    source: "opengraph",
  });
}

// --- TikTok: oEmbed -------------------------------------------------------

async function tiktok(c: Ctx) {
  const j = obj(
    await getJson(
      `https://www.tiktok.com/oembed?url=${enc(c.clip.canonicalUrl)}`,
      opts(c, ["www.tiktok.com"]),
    ),
  );
  // TikTok often leaves title and thumbnail out of oEmbed; the player still works via embedUrl().
  const authorName = str(j.author_name, 100);
  return clean({
    title: str(j.title) ?? (authorName ? `TikTok by ${authorName}` : undefined),
    thumbnailUrl: httpsUrl(j.thumbnail_url),
    authorName,
    authorUrl: httpsUrl(j.author_url),
    source: "oembed",
  });
}

// --- X: oEmbed (text and author, no thumbnail) -----------------------------

async function x(c: Ctx) {
  const j = obj(
    await getJson(
      `https://publish.x.com/oembed?omit_script=1&dnt=true&url=${enc(c.clip.canonicalUrl)}`,
      opts(c, ["publish.x.com"]),
    ),
  );
  const p = typeof j.html === "string" ? /<p[^>]*>([\s\S]*?)<\/p>/i.exec(j.html)?.[1] : undefined;
  const text = p
    ? stripTags(p)
        .replace(/\s*https?:\/\/t\.co\/\S+/g, "")
        .trim()
    : undefined;
  const authorName = str(j.author_name, 100);
  const out: ClipMetadata = {
    title: str(text) ?? (authorName ? `Post by ${authorName}` : undefined),
    authorName,
    authorUrl: httpsUrl(j.author_url),
    source: "oembed",
  };
  return out.title ? clean(out) : null;
}
