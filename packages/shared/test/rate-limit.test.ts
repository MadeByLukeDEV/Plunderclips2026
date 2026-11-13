import { afterAll, describe, expect, it } from "vitest";

// Runs against a real Redis (pnpm dev:services). Skipped when REDIS_URL is not set.
const url = process.env.REDIS_URL;

describe.skipIf(!url)("slidingWindow (Redis)", async () => {
  Object.assign(process.env, {
    DATABASE_URL: process.env.DATABASE_URL ?? "postgres://x@localhost/x",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { slidingWindow } = await import("../src/rate-limit");
  const { redis } = await import("../src/redis");
  const key = `test:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  afterAll(async () => {
    await redis().del(`rl:${key}`);
    redis().disconnect();
  });

  it("allows up to the limit, then blocks with a retry time", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await slidingWindow(key, 3, 60));
    expect(results.slice(0, 3)).toEqual([
      { ok: true, remaining: 2 },
      { ok: true, remaining: 1 },
      { ok: true, remaining: 0 },
    ]);
    const blocked = results[3]!;
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBeGreaterThan(55);
  });

  it("does not count blocked attempts and expires the key", async () => {
    expect(await redis().zcard(`rl:${key}`)).toBe(3);
    const ttl = await redis().pttl(`rl:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });
});

describe("hashIp / clientIp", async () => {
  Object.assign(process.env, {
    DATABASE_URL: process.env.DATABASE_URL ?? "postgres://x@localhost/x",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { clientIp, hashIp } = await import("../src/ip");

  it("trusts the hop our proxy appended, not what the client sent", () => {
    // A client can send its own X-Forwarded-For; Traefik appends the real address at the end.
    const spoofed = new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" });
    expect(clientIp(spoofed)).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers())).toBeNull();
  });

  it("rejects values that aren't IP addresses", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "not-an-ip" }))).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, <script>" }))).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("hashes without leaking the IP and stays stable", () => {
    const a = hashIp("203.0.113.7");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).toBe(hashIp("203.0.113.7"));
    expect(a).not.toBe(hashIp("203.0.113.8"));
    expect(hashIp(null)).toBeNull();
  });
});
