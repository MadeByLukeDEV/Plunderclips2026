export const CHANNEL_PLATFORMS = ["twitch", "youtube", "kick", "tiktok", "x", "medal"] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

export type Channel = { platform: ChannelPlatform; handle: string };

const RULES: Record<ChannelPlatform, RegExp> = {
  twitch: /^[a-z0-9_]{3,25}$/,
  youtube: /^[a-z0-9._-]{3,30}$/,
  kick: /^[a-z0-9_-]{3,40}$/,
  tiktok: /^[a-z0-9._]{2,24}$/,
  x: /^[a-z0-9_]{1,15}$/,
  medal: /^[a-z0-9._-]{2,40}$/,
};

/** Hosts a pasted channel URL may come from, per platform. */
const HOSTS: Record<ChannelPlatform, string[]> = {
  twitch: ["twitch.tv", "www.twitch.tv", "m.twitch.tv"],
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com"],
  kick: ["kick.com", "www.kick.com"],
  tiktok: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
  x: ["x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"],
  medal: ["medal.tv", "www.medal.tv"],
};

/**
 * Accepts a bare handle ("SomeStreamer", "@somestreamer") or a channel URL
 * ("https://www.twitch.tv/SomeStreamer", "youtube.com/@name") and returns the lowercase handle.
 */
export function parseChannel(platform: ChannelPlatform, input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  if (/[/.]/.test(v) && /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}\//i.test(v)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    } catch {
      return null;
    }
    if (!HOSTS[platform].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (platform === "medal") {
      // medal.tv/u/<name>
      if (parts[0] !== "u" || !parts[1]) return null;
      v = parts[1];
    } else {
      if (parts.length !== 1) return null;
      v = parts[0]!;
    }
    if (platform === "youtube" && !v.startsWith("@")) return null; // only @handles, not /channel/UC… ids
  }
  const handle = v.replace(/^@/, "").toLowerCase();
  return RULES[platform].test(handle) ? handle : null;
}

export function channelUrl({ platform, handle }: Channel): string {
  switch (platform) {
    case "twitch":
      return `https://www.twitch.tv/${handle}`;
    case "youtube":
      return `https://www.youtube.com/@${handle}`;
    case "kick":
      return `https://kick.com/${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "x":
      return `https://x.com/${handle}`;
    case "medal":
      return `https://medal.tv/u/${handle}`;
  }
}

/**
 * Author URLs the platforms put in clip metadata for this channel (lowercase), so clips can be
 * matched to a creator even when the clip URL itself doesn't name the channel.
 */
export function authorUrls({ platform, handle }: Channel): string[] {
  switch (platform) {
    case "twitch":
      return [`https://www.twitch.tv/${handle}`, `https://twitch.tv/${handle}`];
    case "youtube":
      return [`https://www.youtube.com/@${handle}`];
    case "kick":
      return [`https://kick.com/${handle}`];
    case "tiktok":
      return [`https://www.tiktok.com/@${handle}`];
    case "x":
      return [`https://x.com/${handle}`, `https://twitter.com/${handle}`];
    case "medal":
      return [`https://medal.tv/u/${handle}`];
  }
}
