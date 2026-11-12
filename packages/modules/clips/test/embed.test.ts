import { describe, expect, it } from "vitest";
import { embedUrl, isAllowedEmbed } from "../src/embed";
import { parseClipUrl, type ParsedClip } from "../src/parse";

const clip = (url: string): ParsedClip => {
  const r = parseClipUrl(url);
  if (!r.ok) throw new Error(r.error);
  return r.clip;
};
const parents = ["plunderclips.example", "localhost"];

describe("embedUrl", () => {
  it("builds Twitch clip embeds with every parent", () => {
    const src = embedUrl(clip("https://clips.twitch.tv/FunnyClipSlug-abc"), { parents });
    const u = new URL(src!);
    expect(u.origin + u.pathname).toBe("https://clips.twitch.tv/embed");
    expect(u.searchParams.get("clip")).toBe("FunnyClipSlug-abc");
    expect(u.searchParams.getAll("parent")).toEqual(parents);
    expect(u.searchParams.get("autoplay")).toBe("false");
  });

  it("builds Twitch VOD embeds with the start time", () => {
    const u = new URL(
      embedUrl(clip("https://www.twitch.tv/videos/2012345678?t=90s"), { parents })!,
    );
    expect(u.hostname).toBe("player.twitch.tv");
    expect(u.searchParams.get("video")).toBe("v2012345678");
    expect(u.searchParams.get("time")).toBe("90s");
  });

  it("uses youtube-nocookie with the start time", () => {
    expect(embedUrl(clip("https://youtu.be/dQw4w9WgXcQ?t=42"), { parents })).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=42",
    );
  });

  it("builds TikTok player embeds", () => {
    expect(embedUrl(clip("https://www.tiktok.com/@a/video/7301234567890123456"), { parents })).toBe(
      "https://www.tiktok.com/player/v1/7301234567890123456",
    );
  });

  it.each([
    "https://www.youtube.com/clip/UgkxAbCdEfGhIjKlMnOpQrStUvWxYz012345",
    "https://kick.com/a/clips/clip_01HZX3ABCDEF1234567890XYZ",
    "https://medal.tv/clips/jb2lZgShoBw9q2p5H",
    "https://x.com/a/status/1790000000000000001",
    "https://vm.tiktok.com/ZMabc1234/",
  ])("leaves %s to metadata or a link-out", (url) => {
    expect(embedUrl(clip(url), { parents })).toBeNull();
  });
});

describe("isAllowedEmbed", () => {
  it("accepts the platform's own https player hosts only", () => {
    expect(isAllowedEmbed("medal", "https://medal.tv/clip/abc/embed")).toBe(true);
    expect(isAllowedEmbed("medal", "http://medal.tv/clip/abc")).toBe(false);
    expect(isAllowedEmbed("medal", "https://evil.example/medal.tv")).toBe(false);
    expect(isAllowedEmbed("kick", "https://medal.tv/clip/abc")).toBe(false);
    expect(isAllowedEmbed("x", "https://x.com/a/status/1")).toBe(false);
    expect(isAllowedEmbed("youtube", "not a url")).toBe(false);
  });
});
