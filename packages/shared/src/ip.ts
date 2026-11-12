import { createHash } from "node:crypto";
import { env } from "./env";

/**
 * Client IP from the proxy headers (Dokploy's Traefik sets x-forwarded-for). First hop only.
 * The app must only be reachable through the proxy, or this header can be spoofed.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

/** Salted SHA-256 of an IP: stable enough for rate limits and abuse review, never stored raw. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = env().IP_HASH_SALT ?? env().BETTER_AUTH_SECRET;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
