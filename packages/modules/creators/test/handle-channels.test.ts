import { describe, expect, it } from "vitest";
import { authorUrls, channelUrl, parseChannel } from "../src/channels";
import { checkHandle, suggestHandle } from "../src/handle";

describe("checkHandle", () => {
  it.each([
    ["captain_ahab", "captain_ahab"],
    ["  @Captain-Ahab ", "captain-ahab"],
    ["abc", "abc"],
    ["a".repeat(24), "a".repeat(24)],
    ["sot2026", "sot2026"],
  ])("accepts %s", (input, handle) => {
    expect(checkHandle(input)).toEqual({ ok: true, handle });
  });

  it.each([
    ["ab", "too_short"],
    ["a".repeat(25), "too_long"],
    ["-pirate", "invalid_chars"],
    ["pirate-", "invalid_chars"],
    ["pi--rate", "invalid_chars"],
    ["pi rate", "invalid_chars"],
    ["pïrate", "invalid_chars"],
    ["admin", "reserved"],
    ["Dashboard", "reserved"],
    ["sea-of-thieves", "reserved"],
    ["plunder_clips", "reserved"],
  ])("rejects %s (%s)", (input, error) => {
    expect(checkHandle(input)).toEqual({ ok: false, error });
  });
});

describe("suggestHandle", () => {
  it("turns a display name into a valid handle", () => {
    expect(suggestHandle("Captain Ahab!")).toBe("captain-ahab");
    expect(suggestHandle("Ségolène  Rōyal")).toBe("segolene-royal");
    expect(suggestHandle("A very long display name that keeps going")).toBe(
      "a-very-long-display-name",
    );
  });

  it("falls back when nothing usable is left", () => {
    expect(suggestHandle("ⓐⓑ")).toMatch(/^crew-[a-z0-9]{6}$/);
    expect(suggestHandle("Admin")).toMatch(/^crew-/);
  });
});

describe("parseChannel", () => {
  it.each([
    ["twitch", "SomeStreamer", "somestreamer"],
    ["twitch", "https://www.twitch.tv/SomeStreamer", "somestreamer"],
    ["twitch", "twitch.tv/somestreamer", "somestreamer"],
    ["youtube", "@SomeCreator", "somecreator"],
    ["youtube", "https://www.youtube.com/@Some.Creator", "some.creator"],
    ["kick", "https://kick.com/some-streamer", "some-streamer"],
    ["tiktok", "@pirate.life", "pirate.life"],
    ["tiktok", "https://www.tiktok.com/@pirate.life", "pirate.life"],
    ["x", "https://twitter.com/SomePirate", "somepirate"],
    ["x", "@somepirate", "somepirate"],
    ["medal", "https://medal.tv/u/SomePirate", "somepirate"],
  ] as const)("%s %s → %s", (platform, input, handle) => {
    expect(parseChannel(platform, input)).toBe(handle);
  });

  it.each([
    ["twitch", ""],
    ["twitch", "https://kick.com/somestreamer"],
    ["twitch", "https://www.twitch.tv/somestreamer/clip/abc"],
    ["twitch", "has space"],
    ["youtube", "https://www.youtube.com/channel/UC1234567890"],
    ["x", "waytoolongforanxhandle"],
    ["medal", "https://medal.tv/games/sea-of-thieves"],
    ["kick", "javascript:alert(1)"],
  ] as const)("rejects %s %s", (platform, input) => {
    expect(parseChannel(platform, input)).toBeNull();
  });
});

describe("channel URLs", () => {
  it("builds the public channel link", () => {
    expect(channelUrl({ platform: "youtube", handle: "somecreator" })).toBe(
      "https://www.youtube.com/@somecreator",
    );
    expect(channelUrl({ platform: "medal", handle: "p" })).toBe("https://medal.tv/u/p");
  });

  it("lists the author URLs platforms report, for clip matching", () => {
    expect(authorUrls({ platform: "x", handle: "jack" })).toEqual([
      "https://x.com/jack",
      "https://twitter.com/jack",
    ]);
    expect(authorUrls({ platform: "twitch", handle: "s" })).toContain("https://www.twitch.tv/s");
  });
});
