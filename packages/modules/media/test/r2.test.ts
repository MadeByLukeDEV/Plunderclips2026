import { afterEach, describe, expect, it, vi } from "vitest";

/** The R2 driver's error reporting, with fetch stubbed (no network, no real bucket). */
async function r2Storage() {
  vi.resetModules();
  Object.assign(process.env, {
    DATABASE_URL: "postgres://x@localhost/x",
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://plunderclips.example",
    MEDIA_DRIVER: "r2",
    MEDIA_PUBLIC_URL: "https://media.plunderclips.example",
    R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET: "plunderclips-media",
  });
  return (await import("../src/storage")).storage();
}

const KEY = "banners/user/abc/0123456789abcdef01234567.webp";

describe("R2 errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names R2's error code and what to check", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (req: Request | string) => {
      calls.push(typeof req === "string" ? req : req.url);
      return new Response(
        '<?xml version="1.0"?><Error><Code>SignatureDoesNotMatch</Code><Message>The request signature we calculated does not match the signature you provided.</Message></Error>',
        { status: 403 },
      );
    });
    const s = await r2Storage();
    await expect(s.put(KEY, Buffer.from("x"), "image/webp")).rejects.toThrow(
      /HTTP 403 SignatureDoesNotMatch: The request signature.*check: R2_SECRET_ACCESS_KEY is wrong/,
    );
    expect(calls[0]).toBe(
      `https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/plunderclips-media/${KEY}`,
    );
  });

  it("sends the image as plain bytes with a known length (R2 refuses chunked uploads)", async () => {
    let seen: { body: unknown; headers: Headers } | null = null;
    vi.stubGlobal("fetch", async (url: string | Request, init?: RequestInit) => {
      expect(typeof url).toBe("string");
      seen = { body: init?.body, headers: new Headers(init?.headers) };
      return new Response("", { status: 200 });
    });
    const s = await r2Storage();
    await s.put(KEY, Buffer.from("hello"), "image/webp");
    expect(seen!.body).toBeInstanceOf(Uint8Array);
    expect((seen!.body as Uint8Array).byteLength).toBe(5);
    expect(seen!.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(seen!.headers.get("content-type")).toBe("image/webp");
  });

  it("says when R2 can't be reached at all", async () => {
    vi.stubGlobal("fetch", async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    });
    const s = await r2Storage();
    await expect(s.put(KEY, Buffer.from("x"), "image/webp")).rejects.toThrow(
      /R2 unreachable \(ENOTFOUND\): check R2_ACCOUNT_ID/,
    );
  });

  it("treats a missing object on delete as done", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    const s = await r2Storage();
    await expect(s.remove(KEY)).resolves.toBeUndefined();
  });
});
