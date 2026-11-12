import { describe, expect, it } from "vitest";
import { parseClipUrl, parseTimestamp, type ParsedClip } from "../src/parse";

function ok(url: string): ParsedClip {
  const r = parseClipUrl(url);
  if (!r.ok) throw new Error(`${url} → ${r.error}`);
  return r.clip;
}
const err = (url: string) => {
  const r = parseClipUrl(url);
  return r.ok ? "ok" : r.error;
};

describe("parseClipUrl: input handling", () => {
  it.each([
    ["", "invalid_url"],
    ["   ", "invalid_url"],
    ["not a url", "invalid_url"],
    ["javascript:alert(1)", "invalid_url"],
    ["ftp://clips.twitch.tv/Abc", "invalid_url"],
    ["https://user:pw@clips.twitch.tv/Abc", "invalid_url"],
    ["https://clips.twitch.tv:8443/Abc", "invalid_url"],
    [`https://clips.twitch.tv/${"a".repeat(2100)}`, "invalid_url"],
    ["https://vimeo.com/123", "unsupported_platform"],
    ["https://twitch.tv.evil.example/clip/Abc", "unsupported_platform"],
    ["https://evil.example/?u=https://clips.twitch.tv/Abc", "unsupported_platform"],
  ])("%s → %s", (url, expected) => {
    expect(err(url)).toBe(expected);
  });

  it("accepts URLs without a scheme and with surrounding whitespace", () => {
    expect(ok("  clips.twitch.tv/FunnyClipSlug-abc123  ").id).toBe("FunnyClipSlug-abc123");
  });

  it("ignores host case and www./m. prefixes", () => {
    expect(ok("HTTPS://WWW.YouTube.COM/watch?v=dQw4w9WgXcQ").id).toBe("dQw4w9WgXcQ");
    expect(ok("https://m.youtube.com/watch?v=dQw4w9WgXcQ").id).toBe("dQw4w9WgXcQ");
  });
});

describe("Twitch", () => {
  const slug = "AwkwardHelplessSalamanderSwiftRage-x1Y2z3";

  it.each([
    `https://clips.twitch.tv/${slug}`,
    `https://clips.twitch.tv/${slug}?tt_medium=clips_api&tt_content=url`,
    `https://www.twitch.tv/somestreamer/clip/${slug}`,
    `https://m.twitch.tv/somestreamer/clip/${slug}?filter=clips`,
    `https://m.twitch.tv/clip/${slug}`,
    `https://clips.twitch.tv/embed?clip=${slug}&parent=example.com`,
    `https://player.twitch.tv/?clip=${slug}&parent=example.com`,
  ])("clip %s", (url) => {
    const c = ok(url);
    expect(c).toMatchObject({ platform: "twitch", kind: "clip", id: slug });
    expect(c.canonicalUrl).toBe(`https://clips.twitch.tv/${slug}`);
    expect(c.key).toBe(`twitch:clip:${slug}`);
  });

  it("keeps the channel from channel clip URLs, lowercased", () => {
    expect(ok(`https://www.twitch.tv/SomeStreamer/clip/${slug}`).channel).toBe("somestreamer");
  });

  it("parses VODs with a timestamp", () => {
    const c = ok("https://www.twitch.tv/videos/2012345678?t=1h2m3s");
    expect(c).toMatchObject({ kind: "video", id: "2012345678", startSeconds: 3723 });
    expect(c.canonicalUrl).toBe("https://www.twitch.tv/videos/2012345678?t=1h2m3s");
    expect(ok("https://player.twitch.tv/?video=v2012345678&parent=x.com").id).toBe("2012345678");
  });

  it.each([
    "https://www.twitch.tv/somestreamer",
    "https://www.twitch.tv/directory/category/sea-of-thieves",
    "https://www.twitch.tv/videos/abc",
    "https://clips.twitch.tv/",
    "https://clips.twitch.tv/a/b",
    "https://dashboard.twitch.tv/u/someone",
  ])("rejects %s", (url) => {
    expect(err(url)).toBe("unsupported_url");
  });
});

describe("YouTube", () => {
  const id = "dQw4w9WgXcQ";

  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/watch?v=${id}&list=PL123&index=2&si=tracking`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abcdef`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com/v/${id}`,
  ])("video %s", (url) => {
    const c = ok(url);
    expect(c).toMatchObject({ platform: "youtube", kind: "video", id });
    expect(c.canonicalUrl).toBe(`https://www.youtube.com/watch?v=${id}`);
  });

  it("gives a Short and its watch URL the same key", () => {
    const short = ok(`https://youtube.com/shorts/${id}?feature=share`);
    expect(short.kind).toBe("short");
    expect(short.canonicalUrl).toBe(`https://www.youtube.com/shorts/${id}`);
    expect(short.key).toBe(ok(`https://youtu.be/${id}`).key);
  });

  it("parses live URLs as videos for dedupe", () => {
    const c = ok(`https://www.youtube.com/live/${id}?si=x`);
    expect(c.kind).toBe("live");
    expect(c.key).toBe(`youtube:video:${id}`);
  });

  it.each([
    ["t=90", 90],
    ["t=90s", 90],
    ["t=1m30s", 90],
    ["t=1h0m1s", 3601],
    ["start=42", 42],
  ])("start time %s", (param, seconds) => {
    const c = ok(`https://www.youtube.com/watch?v=${id}&${param}`);
    expect(c.startSeconds).toBe(seconds);
    expect(c.canonicalUrl).toBe(`https://www.youtube.com/watch?v=${id}&t=${seconds}s`);
  });

  it("parses YouTube clips", () => {
    const clipId = "UgkxAbCdEfGhIjKlMnOpQrStUvWxYz012345";
    const c = ok(`https://www.youtube.com/clip/${clipId}`);
    expect(c).toMatchObject({ kind: "clip", id: clipId, key: `youtube:clip:${clipId}` });
  });

  it.each([
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/playlist?list=PL123",
    "https://youtu.be/",
    "https://www.youtube.com/clip/notaclip",
  ])("rejects %s", (url) => {
    expect(err(url)).toBe("unsupported_url");
  });
});

describe("Kick", () => {
  const clipId = "clip_01HZX3ABCDEF1234567890XYZ";
  const uuid = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

  it.each([
    `https://kick.com/SomeStreamer/clips/${clipId}`,
    `https://kick.com/somestreamer?clip=${clipId}`,
    `https://www.kick.com/somestreamer/clips/${clipId}?utm_source=x`,
  ])("clip %s", (url) => {
    const c = ok(url);
    expect(c).toMatchObject({
      platform: "kick",
      kind: "clip",
      id: clipId,
      channel: "somestreamer",
    });
    expect(c.canonicalUrl).toBe(`https://kick.com/somestreamer/clips/${clipId}`);
  });

  it("parses VODs", () => {
    expect(ok(`https://kick.com/somestreamer/videos/${uuid}`)).toMatchObject({
      kind: "video",
      id: uuid,
      channel: "somestreamer",
    });
    expect(ok(`https://kick.com/video/${uuid.toUpperCase()}`).id).toBe(uuid);
  });

  it.each([
    "https://kick.com/somestreamer",
    "https://kick.com/somestreamer/clips/notaclip",
    "https://kick.com/somestreamer/videos/123",
  ])("rejects %s", (url) => {
    expect(err(url)).toBe("unsupported_url");
  });
});

describe("Medal", () => {
  const id = "jb2lZgShoBw9q2p5H";

  it.each([
    `https://medal.tv/games/sea-of-thieves/clips/${id}/big-kraken-fight`,
    `https://medal.tv/games/sea-of-thieves/clip/${id}`,
    `https://medal.tv/clips/${id}/some-slug?invite=cr-abc`,
    `https://medal.tv/?contentId=${id}`,
  ])("clip %s", (url) => {
    const c = ok(url);
    expect(c).toMatchObject({ platform: "medal", kind: "clip", id });
    expect(c.canonicalUrl).toBe(`https://medal.tv/clips/${id}`);
  });

  it("keeps the game slug from the URL", () => {
    expect(ok(`https://medal.tv/games/sea-of-thieves/clips/${id}`).gameHint).toBe("sea-of-thieves");
    expect(ok(`https://medal.tv/clips/${id}`).gameHint).toBeUndefined();
  });

  it("rejects profile and game pages", () => {
    expect(err("https://medal.tv/games/sea-of-thieves")).toBe("unsupported_url");
    expect(err("https://medal.tv/u/someone")).toBe("unsupported_url");
  });
});

describe("TikTok", () => {
  const id = "7301234567890123456";

  it.each([
    `https://www.tiktok.com/@some.creator/video/${id}`,
    `https://www.tiktok.com/@Some.Creator/video/${id}?is_from_webapp=1&sender_device=pc`,
    `https://m.tiktok.com/@some.creator/video/${id}`,
  ])("video %s", (url) => {
    const c = ok(url);
    expect(c).toMatchObject({ platform: "tiktok", kind: "video", id, channel: "some.creator" });
    expect(c.canonicalUrl).toBe(`https://www.tiktok.com/@some.creator/video/${id}`);
  });

  it("parses embed URLs", () => {
    expect(ok(`https://www.tiktok.com/embed/v2/${id}`).id).toBe(id);
    expect(ok(`https://www.tiktok.com/player/v1/${id}`).id).toBe(id);
  });

  it.each([
    ["https://vm.tiktok.com/ZMabc1234/", "https://vm.tiktok.com/ZMabc1234"],
    ["https://vt.tiktok.com/ZSabc1234/", "https://vt.tiktok.com/ZSabc1234"],
    ["https://www.tiktok.com/t/ZTabc1234/", "https://www.tiktok.com/t/ZTabc1234"],
  ])("marks short link %s for resolving", (url, canonical) => {
    const c = ok(url);
    expect(c.needsResolve).toBe(true);
    expect(c.canonicalUrl).toBe(canonical);
  });

  it("rejects photo posts and profiles", () => {
    expect(err(`https://www.tiktok.com/@some.creator/photo/${id}`)).toBe("unsupported_url");
    expect(err("https://www.tiktok.com/@some.creator")).toBe("unsupported_url");
  });
});

describe("X", () => {
  const id = "1790000000000000001";

  it.each([
    `https://x.com/SomeUser/status/${id}`,
    `https://twitter.com/SomeUser/status/${id}?s=20&t=abc`,
    `https://mobile.twitter.com/SomeUser/status/${id}`,
    `https://x.com/SomeUser/status/${id}/video/1`,
    `https://fxtwitter.com/SomeUser/status/${id}`,
    `https://vxtwitter.com/SomeUser/status/${id}`,
    `https://fixupx.com/SomeUser/status/${id}`,
  ])("post %s", (url) => {
    const c = ok(url);
    expect(c).toMatchObject({ platform: "x", kind: "post", id, channel: "someuser" });
    expect(c.canonicalUrl).toBe(`https://x.com/SomeUser/status/${id}`);
    expect(c.key).toBe(`x:post:${id}`);
  });

  it("parses /i/status links", () => {
    expect(ok(`https://x.com/i/status/${id}`).canonicalUrl).toBe(`https://x.com/i/status/${id}`);
    expect(ok(`https://twitter.com/i/web/status/${id}`).id).toBe(id);
  });

  it.each([
    "https://x.com/SomeUser",
    "https://x.com/SomeUser/status/notanid",
    `https://x.com/SomeUser/status/${id}/analytics`,
  ])("rejects %s", (url) => {
    expect(err(url)).toBe("unsupported_url");
  });
});

describe("parseTimestamp", () => {
  it.each([
    [null, undefined],
    ["", undefined],
    ["0", undefined],
    ["abc", undefined],
    ["12", 12],
    ["2m", 120],
    ["1h", 3600],
    ["1h2m3s", 3723],
  ])("%s → %s", (v, expected) => {
    expect(parseTimestamp(v)).toBe(expected);
  });
});
