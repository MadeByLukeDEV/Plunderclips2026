import type { ParsedClip } from "./parse";

export type EmbedOptions = {
  /** Hostnames the page runs on. Twitch refuses to play without a matching parent. */
  parents: string[];
  /** Start playing as soon as the iframe loads (after the visitor clicked play). */
  autoplay?: boolean;
};

/**
 * iframe src for platforms with a stable, documented player URL.
 * Returns null where the player URL has to come from metadata (YouTube clips, Kick, Medal)
 * or where the platform has no iframe player (X): those use `metadata.embedSrc` or a link-out.
 */
export function embedUrl(
  clip: Pick<ParsedClip, "platform" | "kind" | "id" | "startSeconds" | "needsResolve">,
  { parents, autoplay = false }: EmbedOptions,
): string | null {
  if (clip.needsResolve) return null;
  switch (clip.platform) {
    case "twitch": {
      const p = new URLSearchParams();
      for (const parent of parents) p.append("parent", parent);
      p.set("autoplay", String(autoplay));
      if (clip.kind === "clip") {
        p.set("clip", clip.id);
        return `https://clips.twitch.tv/embed?${p}`;
      }
      p.set("video", `v${clip.id}`);
      if (clip.startSeconds) p.set("time", `${clip.startSeconds}s`);
      return `https://player.twitch.tv/?${p}`;
    }
    case "youtube": {
      if (clip.kind === "clip") return null;
      const p = new URLSearchParams({ rel: "0" });
      if (autoplay) p.set("autoplay", "1");
      if (clip.startSeconds) p.set("start", String(clip.startSeconds));
      return `https://www.youtube-nocookie.com/embed/${clip.id}?${p}`;
    }
    case "tiktok":
      return `https://www.tiktok.com/player/v1/${clip.id}${autoplay ? "?autoplay=1" : ""}`;
    default:
      return null;
  }
}

/** Hosts an iframe src may point at, per platform. Anything from metadata is checked against this. */
export const EMBED_HOSTS: Record<ParsedClip["platform"], string[]> = {
  twitch: ["clips.twitch.tv", "player.twitch.tv"],
  youtube: ["www.youtube.com", "www.youtube-nocookie.com"],
  kick: ["kick.com", "player.kick.com"],
  medal: ["medal.tv"],
  tiktok: ["www.tiktok.com"],
  x: [],
};

export function isAllowedEmbed(platform: ParsedClip["platform"], src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === "https:" && EMBED_HOSTS[platform].includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
