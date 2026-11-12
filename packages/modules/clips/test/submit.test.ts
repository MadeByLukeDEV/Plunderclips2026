import { describe, expect, it, vi } from "vitest";
import type { ClipMetadata } from "../src/metadata";
import { parseClipUrl } from "../src/parse";
import { LIMITS, submitClip, type SubmitDeps, type Submitter } from "../src/submit";

type Row = Awaited<ReturnType<SubmitDeps["insert"]>> & {};

const anon: Submitter = { userId: null, trusted: false, ip: "203.0.113.7" };
const member: Submitter = { userId: "u1", trusted: false, ip: "203.0.113.7" };
const creator: Submitter = { userId: "c1", trusted: true, ip: "203.0.113.7" };
const URL_OK = "https://clips.twitch.tv/FunnyClipSlug-abc";
const META: ClipMetadata = {
  title: "Sunk by a skeleton",
  thumbnailUrl: "https://clips-media-assets2.twitch.tv/t.jpg",
  authorName: "SomeStreamer",
  isSeaOfThieves: true,
  game: "Sea of Thieves",
  source: "api",
};

function setup(over: Partial<SubmitDeps> & { meta?: ClipMetadata | null; rows?: Row[] } = {}) {
  const rows: Row[] = over.rows ?? [];
  const deps: SubmitDeps = {
    findByKey: vi.fn(async (key: string) => rows.find((r) => r.key === key)),
    insert: vi.fn(async (row) => {
      if (rows.some((r) => r.key === row.key)) return undefined;
      const full = {
        id: `id-${rows.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        reviewedAt: null,
        reviewedByUserId: null,
        rejectReason: null,
        ...row,
      } as Row;
      rows.push(full);
      return full;
    }),
    verifyTurnstile: vi.fn(async () => "ok" as const),
    rateLimit: vi.fn(async () => ({ ok: true as const, remaining: 3 })),
    resolve: vi.fn(async (url: string) => parseClipUrl(url)),
    metadata: vi.fn(async () => (over.meta === undefined ? META : over.meta)),
    hashIp: (ip) => (ip ? `hash(${ip})` : null),
    isProduction: true,
    now: () => new Date("2026-11-12T12:00:00Z"),
    ...over,
  };
  return { deps, rows };
}

describe("submitClip", () => {
  it("queues an anonymous clip as pending with platform metadata", async () => {
    const { deps, rows } = setup();
    const r = await submitClip(
      { url: URL_OK, turnstileToken: "tok", note: "  watch the end " },
      anon,
      deps,
    );
    expect(r).toMatchObject({
      ok: true,
      duplicate: false,
      clip: { status: "pending", title: META.title },
    });
    expect(rows[0]).toMatchObject({
      key: "twitch:clip:FunnyClipSlug-abc",
      platform: "twitch",
      platformId: "FunnyClipSlug-abc",
      submittedByUserId: null,
      submitterIpHash: "hash(203.0.113.7)",
      submitterNote: "watch the end",
      approvedAt: null,
      isSeaOfThieves: true,
    });
  });

  it("never stores the raw IP", async () => {
    const { deps, rows } = setup();
    await submitClip({ url: URL_OK, turnstileToken: "tok" }, anon, deps);
    expect(JSON.stringify(rows[0])).not.toContain('203.0.113.7"');
    expect(rows[0]!.submitterIpHash).toBe("hash(203.0.113.7)");
  });

  it("publishes directly for trusted creators", async () => {
    const { deps, rows } = setup();
    const r = await submitClip({ url: URL_OK }, creator, deps);
    expect(r.ok && r.clip.status).toBe("approved");
    expect(rows[0]!.approvedAt).toEqual(new Date("2026-11-12T12:00:00Z"));
    expect(rows[0]!.submittedByUserId).toBe("c1");
  });

  it("sends a trusted creator's clip from another game to review", async () => {
    const { deps } = setup({ meta: { ...META, isSeaOfThieves: false, game: undefined } });
    const r = await submitClip({ url: URL_OK }, creator, deps);
    expect(r.ok && r.clip.status).toBe("pending");
  });

  it("keeps signed-in members without the permission in the queue", async () => {
    const { deps } = setup();
    const r = await submitClip({ url: URL_OK }, member, deps);
    expect(r.ok && r.clip.status).toBe("pending");
  });

  describe("bot check", () => {
    it("rejects a failed captcha for anonymous visitors before anything else", async () => {
      const { deps } = setup({ verifyTurnstile: vi.fn(async () => "failed" as const) });
      expect(await submitClip({ url: URL_OK }, anon, deps)).toEqual({
        ok: false,
        error: "captcha_failed",
      });
      expect(deps.rateLimit).not.toHaveBeenCalled();
      expect(deps.resolve).not.toHaveBeenCalled();
    });

    it("fails closed in production when Turnstile isn't configured", async () => {
      const { deps } = setup({ verifyTurnstile: vi.fn(async () => "not_configured" as const) });
      expect((await submitClip({ url: URL_OK }, anon, deps)).ok).toBe(false);
    });

    it("allows a missing Turnstile key outside production", async () => {
      const { deps } = setup({
        verifyTurnstile: vi.fn(async () => "not_configured" as const),
        isProduction: false,
      });
      expect((await submitClip({ url: URL_OK }, anon, deps)).ok).toBe(true);
    });

    it("skips the captcha for signed-in members", async () => {
      const { deps } = setup({ verifyTurnstile: vi.fn(async () => "failed" as const) });
      expect((await submitClip({ url: URL_OK }, member, deps)).ok).toBe(true);
      expect(deps.verifyTurnstile).not.toHaveBeenCalled();
    });
  });

  describe("rate limits", () => {
    it("checks the burst and daily windows per IP hash for anonymous visitors", async () => {
      const { deps } = setup();
      await submitClip({ url: URL_OK, turnstileToken: "t" }, anon, deps);
      expect(deps.rateLimit).toHaveBeenCalledWith(
        "submit:ip:hash(203.0.113.7):burst",
        LIMITS.anonBurst.limit,
        LIMITS.anonBurst.windowSeconds,
      );
      expect(deps.rateLimit).toHaveBeenCalledWith(
        "submit:ip:hash(203.0.113.7):day",
        LIMITS.anonDaily.limit,
        LIMITS.anonDaily.windowSeconds,
      );
    });

    it("limits signed-in members per account", async () => {
      const { deps } = setup();
      await submitClip({ url: URL_OK }, member, deps);
      expect(deps.rateLimit).toHaveBeenCalledTimes(1);
      expect(deps.rateLimit).toHaveBeenCalledWith(
        "submit:user:u1",
        LIMITS.user.limit,
        LIMITS.user.windowSeconds,
      );
    });

    it("stops before resolving or fetching anything", async () => {
      const { deps } = setup({
        rateLimit: vi.fn(async () => ({ ok: false as const, retryAfterSeconds: 240 })),
      });
      expect(await submitClip({ url: URL_OK, turnstileToken: "t" }, anon, deps)).toEqual({
        ok: false,
        error: "rate_limited",
        retryAfterSeconds: 240,
      });
      expect(deps.resolve).not.toHaveBeenCalled();
      expect(deps.metadata).not.toHaveBeenCalled();
    });
  });

  describe("duplicates", () => {
    it("returns the existing clip without fetching metadata", async () => {
      const { deps } = setup();
      await submitClip({ url: URL_OK, turnstileToken: "t" }, anon, deps);
      const again = await submitClip(
        {
          url: "https://www.twitch.tv/somestreamer/clip/FunnyClipSlug-abc?filter=clips",
          turnstileToken: "t",
        },
        anon,
        deps,
      );
      expect(again).toMatchObject({
        ok: true,
        duplicate: true,
        clip: { id: "id-1", status: "pending" },
      });
      expect(deps.metadata).toHaveBeenCalledTimes(1);
    });

    it("handles two submissions racing on the unique key", async () => {
      const { deps, rows } = setup();
      // First lookup misses, then another request inserts the same clip before ours.
      deps.findByKey = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockImplementation(async (key: string) => rows.find((r) => r.key === key));
      await deps.insert({
        key: "twitch:clip:FunnyClipSlug-abc",
        platform: "twitch",
        kind: "clip",
        platformId: "FunnyClipSlug-abc",
        canonicalUrl: URL_OK,
        title: "first",
      });
      const r = await submitClip({ url: URL_OK, turnstileToken: "t" }, anon, deps);
      expect(r).toMatchObject({ ok: true, duplicate: true, clip: { title: "first" } });
    });
  });

  describe("input", () => {
    it.each([
      ["not a url", "invalid_url"],
      ["https://vimeo.com/1", "unsupported_platform"],
      ["https://www.twitch.tv/somestreamer", "unsupported_url"],
    ])("%s → %s", async (url, error) => {
      const { deps } = setup();
      expect(await submitClip({ url, turnstileToken: "t" }, anon, deps)).toEqual({
        ok: false,
        error,
      });
    });

    it("needs a typed title when the platform gives none", async () => {
      const { deps } = setup({ meta: null });
      expect(await submitClip({ url: URL_OK, turnstileToken: "t" }, anon, deps)).toEqual({
        ok: false,
        error: "title_required",
      });
      const r = await submitClip(
        { url: URL_OK, turnstileToken: "t", title: "  Kraken   at dawn " },
        anon,
        deps,
      );
      expect(r.ok && r.clip.title).toBe("Kraken at dawn");
    });

    it("prefers the platform title over a typed one", async () => {
      const { deps } = setup();
      const r = await submitClip({ url: URL_OK, title: "my title" }, member, deps);
      expect(r.ok && r.clip.title).toBe(META.title);
    });

    it("limits title and note length", async () => {
      const { deps } = setup();
      expect(await submitClip({ url: URL_OK, title: "x".repeat(121) }, member, deps)).toEqual({
        ok: false,
        error: "title_too_long",
      });
      expect(await submitClip({ url: URL_OK, note: "x".repeat(281) }, member, deps)).toEqual({
        ok: false,
        error: "note_too_long",
      });
    });
  });
});
