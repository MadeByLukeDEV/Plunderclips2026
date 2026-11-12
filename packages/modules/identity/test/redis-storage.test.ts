import { afterAll, describe, expect, it } from "vitest";

// Runs against a real Redis (pnpm dev:services). Skipped when REDIS_URL is not set.
const url = process.env.REDIS_URL;

describe.skipIf(!url)("redisStorage", async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  const { redisStorage } = await import("../src/redis-storage");
  const { redis } = await import("@plunderclips/shared");
  const storage = redisStorage();
  const key = `test:${crypto.randomUUID()}`;

  afterAll(async () => {
    await redis().del(`auth:${key}`, `auth:${key}:n`);
    redis().disconnect();
  });

  it("sets, gets and deletes with a TTL", async () => {
    await storage.set(key, "value", 60);
    expect(await storage.get(key)).toBe("value");
    expect(await redis().ttl(`auth:${key}`)).toBeGreaterThan(50);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it("getAndDelete reads once", async () => {
    await storage.set(key, "once", 60);
    expect(await storage.getAndDelete(key)).toBe("once");
    expect(await storage.get(key)).toBeNull();
  });

  it("increment counts and keeps the first TTL (fixed window)", async () => {
    const k = `${key}:n`;
    expect(await storage.increment(k, 30)).toBe(1);
    expect(await storage.increment(k, 999)).toBe(2);
    const ttl = await redis().ttl(`auth:${k}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });
});
