import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { env } from "./env";

/**
 * The visitor's IP, as the proxy in front of the app saw it.
 *
 * X-Forwarded-For is a list the client can start: "spoofed, …, <added by our proxy>". Only the
 * entries our own proxies appended can be trusted, counted from the right. With one proxy
 * (Dokploy's Traefik) that's the last entry. TRUSTED_PROXY_HOPS raises the count for chains
 * like CDN → Traefik; CLIENT_IP_HEADER names a single header a CDN sets instead
 * (e.g. cf-connecting-ip behind Cloudflare). Never the first entry: a visitor could pick any IP
 * there and walk past every per-IP rate limit.
 *
 * The app must only be reachable through the proxy (see docs/deploy.md).
 */
export function clientIp(headers: Headers): string | null {
  const e = env();
  let ip: string | undefined;
  if (e.CLIENT_IP_HEADER) {
    ip = headers.get(e.CLIENT_IP_HEADER)?.split(",")[0]?.trim();
  } else {
    const chain = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    ip = chain.length ? chain[Math.max(chain.length - e.TRUSTED_PROXY_HOPS, 0)] : undefined;
    ip ??= headers.get("x-real-ip")?.trim();
  }
  return ip && isIP(ip) ? ip : null;
}

/** Salted SHA-256 of an IP: stable enough for rate limits and abuse review, never stored raw. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = env().IP_HASH_SALT ?? env().BETTER_AUTH_SECRET;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
