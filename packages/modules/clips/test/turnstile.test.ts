import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../src/http";

const REAL_SECRET = "0x4AAAAAAAreal-secret-for-tests";
const TEST_PASS_SECRET = "1x0000000000000000000000000000000AA";

/** env() is cached per process: each case gets a fresh module graph with its own variables. */
async function load(extra: Record<string, string>) {
  vi.resetModules();
  for (const k of ["TURNSTILE_SECRET_KEY", "TURNSTILE_HOSTNAMES", "NODE_ENV"]) delete process.env[k];
  Object.assign(process.env, {
    DATABASE_URL: "postgres://x@localhost/x",
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "https://plunderclips.example",
    NODE_ENV: "production",
    ...extra,
  });
  return import("../src/turnstile");
}

function siteverify(body: Record<string, unknown>, status = 200) {
  const calls: { url: string; body: string }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, body: String(init?.body) });
    return new Response(JSON.stringify(body), { status });
  };
  return { impl, calls };
}

const good = { success: true, action: "submit_clip", hostname: "plunderclips.example" };

describe("verifyTurnstile", () => {
  it("accepts a token for our action and hostname, and sends secret, token and IP", async () => {
    const t = await load({ TURNSTILE_SECRET_KEY: REAL_SECRET });
    const f = siteverify(good);
    expect(await t.verifyTurnstile("tok", "203.0.113.7", f.impl)).toBe("ok");
    expect(f.calls[0]!.url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const sent = new URLSearchParams(f.calls[0]!.body);
    expect(Object.fromEntries(sent)).toEqual({ secret: REAL_SECRET, response: "tok", remoteip: "203.0.113.7" });
  });

  it("refuses a token issued for another action", async () => {
    const t = await load({ TURNSTILE_SECRET_KEY: REAL_SECRET });
    expect(await t.verifyTurnstile("tok", null, siteverify({ ...good, action: "login" }).impl)).toBe("failed");
    expect(await t.verifyTurnstile("tok", null, siteverify({ ...good, action: undefined }).impl)).toBe("failed");
  });

  it("refuses a token solved on another site", async () => {
    const t = await load({ TURNSTILE_SECRET_KEY: REAL_SECRET });
    expect(await t.verifyTurnstile("tok", null, siteverify({ ...good, hostname: "evil.example" }).impl)).toBe(
      "failed",
    );
    expect(await t.verifyTurnstile("tok", null, siteverify({ ...good, hostname: "localhost" }).impl)).toBe("failed");
  });

  it("accepts any host listed in TURNSTILE_HOSTNAMES, case-insensitively", async () => {
    const t = await load({
      TURNSTILE_SECRET_KEY: REAL_SECRET,
      TURNSTILE_HOSTNAMES: "plunderclips.example, www.plunderclips.example",
    });
    expect(await t.verifyTurnstile("tok", null, siteverify({ ...good, hostname: "WWW.plunderclips.example" }).impl)).toBe(
      "ok",
    );
  });

  it("refuses Cloudflare's failure answers, HTTP errors and network errors", async () => {
    const t = await load({ TURNSTILE_SECRET_KEY: REAL_SECRET });
    expect(
      await t.verifyTurnstile("tok", null, siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] }).impl),
    ).toBe("failed");
    expect(await t.verifyTurnstile("tok", null, siteverify(good, 500).impl)).toBe("failed");
    const boom: FetchLike = async () => {
      throw new Error("ECONNRESET");
    };
    expect(await t.verifyTurnstile("tok", null, boom)).toBe("failed");
  });

  it("refuses missing or oversized tokens without calling Cloudflare", async () => {
    const t = await load({ TURNSTILE_SECRET_KEY: REAL_SECRET });
    const f = siteverify(good);
    expect(await t.verifyTurnstile("", null, f.impl)).toBe("failed");
    expect(await t.verifyTurnstile("x".repeat(2049), null, f.impl)).toBe("failed");
    expect(f.calls).toHaveLength(0);
  });

  it("reports not_configured without a secret", async () => {
    const t = await load({});
    expect(await t.verifyTurnstile("tok", null, siteverify(good).impl)).toBe("not_configured");
  });

  it("refuses Cloudflare's always-pass test secret in production", async () => {
    const t = await load({ TURNSTILE_SECRET_KEY: TEST_PASS_SECRET });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = siteverify({ success: true });
    expect(await t.verifyTurnstile("tok", null, f.impl)).toBe("not_configured");
    expect(f.calls).toHaveLength(0);
    spy.mockRestore();
  });

  it("accepts the test secret's answer in development (no real action or hostname in it)", async () => {
    const t = await load({ TURNSTILE_SECRET_KEY: TEST_PASS_SECRET, NODE_ENV: "development" });
    expect(await t.verifyTurnstile("tok", null, siteverify({ success: true, hostname: "example.com" }).impl)).toBe("ok");
  });
});
