import { describe, expect, it, vi } from "vitest";
import { fetchClipMetadata } from "../src/metadata";
import type { FetchLike } from "../src/http";
import { parseClipUrl, type ParsedClip } from "../src/parse";
import { resolveClipUrl } from "../src/resolve";
import { readMetaTags } from "../src/opengraph";

const clip = (url: string): ParsedClip => {
  const r = parseClipUrl(url);
  if (!r.ok) throw new Error(r.error);
  return r.clip;
};

type Route = { status?: number; json?: unknown; html?: string; headers?: Record<string, string> };

/** Fake fetch: routes by URL prefix and records every request. */
function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const prefix = Object.keys(routes).find((p) => url.startsWith(p));
    if (!prefix) return new Response("not found", { status: 404 });
    const r = routes[prefix]!;
    const body = r.json !== undefined ? JSON.stringify(r.json) : (r.html ?? "");
    return new Response(r.status && r.status >= 300 && r.status < 400 ? null : body, {
      status: r.status ?? 200,
      headers: r.headers,
    });
  };
  return { impl, calls };
}

describe("YouTube", () => {
  it("reads title, author and thumbnail from oEmbed", async () => {
    const f = fakeFetch({
      "https://www.youtube.com/oembed": {
        json: {
          title: "Kraken  ambush at Plunder Outpost",
          author_name: "Some Pirate",
          author_url: "https://www.youtube.com/@somepirate",
          thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
          html: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
        },
      },
    });
    const m = await fetchClipMetadata(clip("https://youtu.be/dQw4w9WgXcQ?si=x"), { fetch: f.impl });
    expect(m).toEqual({
      title: "Kraken ambush at Plunder Outpost",
      authorName: "Some Pirate",
      authorUrl: "https://www.youtube.com/@somepirate",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      source: "oembed",
    });
    expect(f.calls[0]!.url).toBe(
      "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ",
    );
  });

  it("takes a YouTube clip's player from oEmbed, moved to nocookie", async () => {
    const f = fakeFetch({
      "https://www.youtube.com/oembed": {
        json: {
          title: "Clip",
          html: '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?clip=Ugkx1&amp;clipt=EAA"></iframe>',
        },
      },
    });
    const m = await fetchClipMetadata(
      clip("https://www.youtube.com/clip/UgkxAbCdEfGhIjKlMnOpQrStUvWxYz012345"),
      { fetch: f.impl },
    );
    expect(m?.embedSrc).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?clip=Ugkx1&clipt=EAA",
    );
  });

  it("returns null for a private or deleted video", async () => {
    const f = fakeFetch({ "https://www.youtube.com/oembed": { status: 401, json: {} } });
    expect(
      await fetchClipMetadata(clip("https://youtu.be/dQw4w9WgXcQ"), { fetch: f.impl }),
    ).toBeNull();
  });

  it("drops non-https thumbnails", async () => {
    const f = fakeFetch({
      "https://www.youtube.com/oembed": {
        json: { title: "T", thumbnail_url: "http://i.ytimg.com/x.jpg" },
      },
    });
    const m = await fetchClipMetadata(clip("https://youtu.be/dQw4w9WgXcQ"), { fetch: f.impl });
    expect(m).toEqual({ title: "T", source: "oembed" });
  });
});

describe("Twitch", () => {
  const twitchAuth = async () => ({ clientId: "cid", token: "tok" });

  it("uses Helix with the app token and flags Sea of Thieves", async () => {
    const f = fakeFetch({
      "https://api.twitch.tv/helix/clips": {
        json: {
          data: [
            {
              id: "FunnyClipSlug-abc",
              title: "Sunk by a skeleton",
              broadcaster_name: "SomeStreamer",
              thumbnail_url: "https://clips-media-assets2.twitch.tv/x-preview-480x272.jpg",
              game_id: "490377",
              duration: 29.9,
            },
          ],
        },
      },
    });
    const m = await fetchClipMetadata(clip("https://clips.twitch.tv/FunnyClipSlug-abc"), {
      fetch: f.impl,
      twitchAuth,
    });
    expect(m).toEqual({
      title: "Sunk by a skeleton",
      authorName: "SomeStreamer",
      authorUrl: "https://www.twitch.tv/somestreamer",
      thumbnailUrl: "https://clips-media-assets2.twitch.tv/x-preview-480x272.jpg",
      durationSeconds: 30,
      game: "Sea of Thieves",
      isSeaOfThieves: true,
      source: "api",
    });
    const headers = f.calls[0]!.init!.headers as Record<string, string>;
    expect(headers["client-id"]).toBe("cid");
    expect(headers.authorization).toBe("Bearer tok");
  });

  it("flags clips from other games", async () => {
    const f = fakeFetch({
      "https://api.twitch.tv/helix/clips": {
        json: { data: [{ id: "x", title: "Other game", game_id: "12345" }] },
      },
    });
    const m = await fetchClipMetadata(clip("https://clips.twitch.tv/FunnyClipSlug-abc"), {
      fetch: f.impl,
      twitchAuth,
    });
    expect(m?.isSeaOfThieves).toBe(false);
  });

  it("fills the VOD thumbnail size and parses the duration", async () => {
    const f = fakeFetch({
      "https://api.twitch.tv/helix/videos": {
        json: {
          data: [
            {
              id: "2012345678",
              title: "Long voyage",
              user_login: "somestreamer",
              user_name: "SomeStreamer",
              duration: "3h2m1s",
              thumbnail_url: "https://static-cdn.jtvnw.net/x-%{width}x%{height}.jpg",
            },
          ],
        },
      },
    });
    const m = await fetchClipMetadata(clip("https://www.twitch.tv/videos/2012345678"), {
      fetch: f.impl,
      twitchAuth,
    });
    expect(m).toMatchObject({
      thumbnailUrl: "https://static-cdn.jtvnw.net/x-640x360.jpg",
      durationSeconds: 10921,
      authorUrl: "https://www.twitch.tv/somestreamer",
    });
  });

  it("falls back to page meta tags without credentials", async () => {
    const f = fakeFetch({
      "https://clips.twitch.tv/": {
        html: '<head><meta property="og:title" content="Sunk &amp; salty"><meta property="og:image" content="https://clips-media-assets2.twitch.tv/p.jpg"></head>',
      },
    });
    const m = await fetchClipMetadata(clip("https://clips.twitch.tv/FunnyClipSlug-abc"), {
      fetch: f.impl,
    });
    expect(m).toEqual({
      title: "Sunk & salty",
      thumbnailUrl: "https://clips-media-assets2.twitch.tv/p.jpg",
      source: "opengraph",
    });
  });
});

describe("Kick", () => {
  const url = "https://kick.com/somestreamer/clips/clip_01HZX3ABCDEF1234567890XYZ";

  it("reads the public clip API", async () => {
    const f = fakeFetch({
      "https://kick.com/api/v2/clips/": {
        json: {
          clip: {
            id: "clip_01HZX3ABCDEF1234567890XYZ",
            title: "Barrel of gunpowder",
            thumbnail_url: "https://clips.kick.com/t.jpg",
            duration: 45,
            channel: { username: "SomeStreamer", slug: "somestreamer" },
            category: { name: "Sea of Thieves", slug: "sea-of-thieves" },
          },
        },
      },
    });
    expect(await fetchClipMetadata(clip(url), { fetch: f.impl })).toEqual({
      title: "Barrel of gunpowder",
      thumbnailUrl: "https://clips.kick.com/t.jpg",
      authorName: "SomeStreamer",
      authorUrl: "https://kick.com/somestreamer",
      durationSeconds: 45,
      game: "Sea of Thieves",
      isSeaOfThieves: true,
      source: "api",
    });
  });

  it("falls back to the page when the API is blocked", async () => {
    const f = fakeFetch({
      "https://kick.com/api/": { status: 403, html: "blocked" },
      "https://kick.com/somestreamer/": {
        html: '<meta content="Barrel" property="og:title"><meta name="twitter:image" content="https://clips.kick.com/t.jpg">',
      },
    });
    expect(await fetchClipMetadata(clip(url), { fetch: f.impl })).toEqual({
      title: "Barrel",
      thumbnailUrl: "https://clips.kick.com/t.jpg",
      source: "opengraph",
    });
  });
});

describe("Medal", () => {
  it("reads meta tags, keeps an allowed player and the game hint", async () => {
    const f = fakeFetch({
      "https://medal.tv/clips/": {
        html: `<html><head>
          <meta property="og:title" content="Megalodon at dawn">
          <meta property="og:image" content="https://cdn.medal.tv/thumb.jpg">
          <meta property="og:video:secure_url" content="https://medal.tv/clip/jb2lZgShoBw9q2p5H/embed">
        </head><body><meta property="og:title" content="ignored body tag"></body></html>`,
      },
    });
    const m = await fetchClipMetadata(
      clip("https://medal.tv/games/sea-of-thieves/clips/jb2lZgShoBw9q2p5H/slug"),
      { fetch: f.impl },
    );
    expect(m).toEqual({
      title: "Megalodon at dawn",
      thumbnailUrl: "https://cdn.medal.tv/thumb.jpg",
      embedSrc: "https://medal.tv/clip/jb2lZgShoBw9q2p5H/embed",
      game: "Sea of Thieves",
      isSeaOfThieves: true,
      source: "opengraph",
    });
  });

  it("drops a player on a foreign host", async () => {
    const f = fakeFetch({
      "https://medal.tv/clips/": {
        html: '<meta property="og:title" content="T"><meta property="og:video" content="https://evil.example/player">',
      },
    });
    const m = await fetchClipMetadata(clip("https://medal.tv/clips/jb2lZgShoBw9q2p5H"), {
      fetch: f.impl,
    });
    expect(m?.embedSrc).toBeUndefined();
  });
});

describe("TikTok", () => {
  it("reads oEmbed", async () => {
    const f = fakeFetch({
      "https://www.tiktok.com/oembed": {
        json: {
          title: "Pirate life",
          author_name: "creator",
          author_url: "https://www.tiktok.com/@creator",
          thumbnail_url: "https://p16-sign.tiktokcdn.com/t.jpg",
        },
      },
    });
    const m = await fetchClipMetadata(
      clip("https://www.tiktok.com/@creator/video/7301234567890123456"),
      {
        fetch: f.impl,
      },
    );
    expect(m).toMatchObject({ title: "Pirate life", authorName: "creator", source: "oembed" });
  });

  it("falls back to the author when oEmbed has no title", async () => {
    const f = fakeFetch({ "https://www.tiktok.com/oembed": { json: { author_name: "creator" } } });
    const m = await fetchClipMetadata(
      clip("https://www.tiktok.com/@creator/video/7301234567890123456"),
      {
        fetch: f.impl,
      },
    );
    expect(m?.title).toBe("TikTok by creator");
  });

  it("returns null when oEmbed has nothing usable", async () => {
    const f = fakeFetch({ "https://www.tiktok.com/oembed": { json: { type: "video" } } });
    expect(
      await fetchClipMetadata(clip("https://www.tiktok.com/@creator/video/7301234567890123456"), {
        fetch: f.impl,
      }),
    ).toBeNull();
  });

  it("skips unresolved short links", async () => {
    const f = fakeFetch({});
    expect(
      await fetchClipMetadata(clip("https://vm.tiktok.com/ZMabc1234/"), { fetch: f.impl }),
    ).toBeNull();
    expect(f.calls).toHaveLength(0);
  });
});

describe("X", () => {
  it("uses the post text as the title, without t.co links", async () => {
    const f = fakeFetch({
      "https://publish.x.com/oembed": {
        json: {
          author_name: "Some Pirate",
          author_url: "https://twitter.com/somepirate",
          html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Three ships, one keg &amp; a dream <a href="https://t.co/abc">https://t.co/abc</a></p>&mdash; Some Pirate</blockquote>',
        },
      },
    });
    const m = await fetchClipMetadata(clip("https://x.com/somepirate/status/1790000000000000001"), {
      fetch: f.impl,
    });
    expect(m).toEqual({
      title: "Three ships, one keg & a dream",
      authorName: "Some Pirate",
      authorUrl: "https://twitter.com/somepirate",
      source: "oembed",
    });
  });
});

describe("safety", () => {
  it("never throws: network errors become null", async () => {
    const boom: FetchLike = async () => {
      throw new Error("ECONNRESET");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await fetchClipMetadata(clip("https://youtu.be/dQw4w9WgXcQ"), { fetch: boom }),
    ).toBeNull();
    spy.mockRestore();
  });

  it("never requests a redirect hop off the allowed hosts", async () => {
    const f = fakeFetch({
      "https://medal.tv/clips/": {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      },
      "http://169.254.169.254/": { html: "secret" },
    });
    expect(
      await fetchClipMetadata(clip("https://medal.tv/clips/jb2lZgShoBw9q2p5H"), { fetch: f.impl }),
    ).toBeNull();
    expect(f.calls.map((c) => c.url)).toEqual(["https://medal.tv/clips/jb2lZgShoBw9q2p5H"]);
    expect(f.calls[0]!.init!.redirect).toBe("manual");
  });

  it("follows redirects that stay on allowed hosts", async () => {
    const f = fakeFetch({
      "https://medal.tv/clips/jb2lZgShoBw9q2p5H": {
        status: 301,
        headers: { location: "/games/sea-of-thieves/clips/jb2lZgShoBw9q2p5H/slug" },
      },
      "https://medal.tv/games/": { html: '<meta property="og:title" content="After redirect">' },
    });
    const m = await fetchClipMetadata(clip("https://medal.tv/clips/jb2lZgShoBw9q2p5H"), {
      fetch: f.impl,
    });
    expect(m?.title).toBe("After redirect");
    expect(f.calls).toHaveLength(2);
  });

  it("gives up after a few redirects", async () => {
    const f = fakeFetch({
      "https://medal.tv/clips/": {
        status: 302,
        headers: { location: "https://medal.tv/clips/jb2lZgShoBw9q2p5H" },
      },
    });
    expect(
      await fetchClipMetadata(clip("https://medal.tv/clips/jb2lZgShoBw9q2p5H"), { fetch: f.impl }),
    ).toBeNull();
    expect(f.calls).toHaveLength(4);
  });

  it("caps the body it reads", async () => {
    const big = "x".repeat(2 * 1024 * 1024);
    const f = fakeFetch({
      "https://medal.tv/clips/": { html: `<meta property="og:title" content="T">${big}` },
    });
    const m = await fetchClipMetadata(clip("https://medal.tv/clips/jb2lZgShoBw9q2p5H"), {
      fetch: f.impl,
    });
    expect(m?.title).toBe("T");
  });
});

describe("resolveClipUrl", () => {
  it("follows a TikTok short link to the video", async () => {
    const f = fakeFetch({
      "https://vm.tiktok.com/ZMabc1234": {
        status: 301,
        headers: { location: "https://www.tiktok.com/@creator/video/7301234567890123456?_r=1" },
      },
    });
    const r = await resolveClipUrl("https://vm.tiktok.com/ZMabc1234/", { fetch: f.impl });
    expect(r.ok && r.clip).toMatchObject({ id: "7301234567890123456", channel: "creator" });
    expect(f.calls[0]!.init!.redirect).toBe("manual");
  });

  it("refuses a short link that leaves TikTok", async () => {
    const f = fakeFetch({
      "https://vm.tiktok.com/": {
        status: 302,
        headers: { location: "https://youtu.be/dQw4w9WgXcQ" },
      },
    });
    expect(await resolveClipUrl("https://vm.tiktok.com/ZMabc1234/", { fetch: f.impl })).toEqual({
      ok: false,
      error: "unsupported_url",
    });
  });

  it("gives up on redirect loops", async () => {
    const f = fakeFetch({
      "https://vm.tiktok.com/": {
        status: 302,
        headers: { location: "https://vm.tiktok.com/ZMabc1234" },
      },
    });
    const r = await resolveClipUrl("https://vm.tiktok.com/ZMabc1234/", { fetch: f.impl });
    expect(r).toEqual({ ok: false, error: "unsupported_url" });
    expect(f.calls).toHaveLength(3);
  });

  it("passes normal URLs through without a request", async () => {
    const f = fakeFetch({});
    const r = await resolveClipUrl("https://youtu.be/dQw4w9WgXcQ", { fetch: f.impl });
    expect(r.ok).toBe(true);
    expect(f.calls).toHaveLength(0);
  });
});

describe("readMetaTags", () => {
  it("handles attribute order, single quotes and the first value winning", () => {
    const m = readMetaTags(
      `<meta content='A &quot;quoted&quot; title' property='og:title'><meta property="og:title" content="second"><meta name=description content=plain>`,
    );
    expect(m.get("og:title")).toBe('A "quoted" title');
    expect(m.get("description")).toBe("plain");
  });
});
