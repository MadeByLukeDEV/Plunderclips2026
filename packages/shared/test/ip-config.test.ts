import { describe, expect, it, vi } from "vitest";

// env() is cached per process, so each configuration gets a fresh module graph.
async function withEnv(extra: Record<string, string>) {
  vi.resetModules();
  Object.assign(process.env, {
    DATABASE_URL: "postgres://x@localhost/x",
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
    TRUSTED_PROXY_HOPS: "",
    CLIENT_IP_HEADER: "",
    ...extra,
  });
  for (const k of ["TRUSTED_PROXY_HOPS", "CLIENT_IP_HEADER"])
    if (!process.env[k]) delete process.env[k];
  return import("../src/ip");
}

describe("clientIp configuration", () => {
  it("counts trusted proxies from the right (CDN → Traefik)", async () => {
    const { clientIp } = await withEnv({ TRUSTED_PROXY_HOPS: "2" });
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 172.70.1.1" });
    expect(clientIp(h)).toBe("203.0.113.7");
  });

  it("reads one CDN header when configured, and ignores X-Forwarded-For", async () => {
    const { clientIp } = await withEnv({ CLIENT_IP_HEADER: "cf-connecting-ip" });
    const h = new Headers({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "6.6.6.6" });
    expect(clientIp(h)).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6" }))).toBeNull();
  });
});

describe("empty variables", () => {
  it("treats an empty CLIENT_IP_HEADER as unset instead of failing", async () => {
    const { clientIp } = await withEnv({});
    process.env.CLIENT_IP_HEADER = "";
    vi.resetModules();
    const fresh = await import("../src/ip");
    expect(fresh.clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp).toBeTypeOf("function");
  });
});
