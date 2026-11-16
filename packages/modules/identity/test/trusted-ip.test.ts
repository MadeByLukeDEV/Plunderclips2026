import { describe, expect, it } from "vitest";

describe("withTrustedIp", async () => {
  Object.assign(process.env, {
    DATABASE_URL: process.env.DATABASE_URL ?? "postgres://x@localhost/x",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { withTrustedIp } = await import("../src/next-handler");
  const { CLIENT_IP_HEADER } = await import("../src/auth");

  it("replaces a client-sent copy with the IP our proxy reported", async () => {
    const req = new Request("http://localhost:3000/api/auth/sign-in/social", {
      method: "POST",
      headers: {
        [CLIENT_IP_HEADER]: "6.6.6.6",
        "x-forwarded-for": "1.1.1.1, 203.0.113.7",
        "content-type": "application/json",
      },
      body: JSON.stringify({ provider: "twitch" }),
    });
    const out = withTrustedIp(req);
    expect(out.headers.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(await out.json()).toEqual({ provider: "twitch" });
  });

  it("drops the header when there's no usable IP", () => {
    const out = withTrustedIp(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { [CLIENT_IP_HEADER]: "6.6.6.6" },
      }),
    );
    expect(out.headers.get(CLIENT_IP_HEADER)).toBeNull();
  });
});
