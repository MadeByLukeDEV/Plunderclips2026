import { env, logger } from "@plunderclips/shared";
import type { FetchLike } from "./http";

export type TurnstileResult = "ok" | "failed" | "not_configured";

/** The action the submit form's widget sends; siteverify must report the same one back. */
export const TURNSTILE_ACTION = "submit_clip";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare's documented test secrets (1x… always passes, 2x… always fails, 3x… reports a spent
 * token). Their answers don't carry a real action or hostname, so those checks are skipped for
 * them, and only outside production: a test secret in production would let every bot through.
 */
const TEST_SECRET = /^[123]x0{31}AA$/;

/** Hostnames a token may have been solved on: TURNSTILE_HOSTNAMES, else the site's own host. */
export function expectedHostnames(): Set<string> {
  const e = env();
  const list = e.TURNSTILE_HOSTNAMES
    ? e.TURNSTILE_HOSTNAMES.split(",")
    : [new URL(e.BETTER_AUTH_URL).hostname];
  return new Set(list.map((h) => h.trim().toLowerCase()).filter(Boolean));
}

type SiteverifyResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

/**
 * Verifies a Cloudflare Turnstile token on the server (siteverify). A token passes only when
 * Cloudflare says success, it was issued for this form's action, and it was solved on one of our
 * hostnames (a token from another site using the same sitekey is refused). Tokens are single-use;
 * Cloudflare rejects a replay. Without TURNSTILE_SECRET_KEY: "not_configured", which the caller
 * allows only outside production.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<TurnstileResult> {
  const e = env();
  const secret = e.TURNSTILE_SECRET_KEY;
  if (!secret) return "not_configured";
  const testSecret = TEST_SECRET.test(secret);
  if (testSecret && e.NODE_ENV === "production") {
    logger.error("turnstile test secret in production; refusing anonymous submissions");
    return "not_configured";
  }
  if (!token || token.length > 2048) return "failed";

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetchImpl(SITEVERIFY, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn("turnstile siteverify http error", { status: res.status });
      return "failed";
    }
    const json = (await res.json()) as SiteverifyResponse;
    if (json.success !== true) {
      logger.info("turnstile rejected", { codes: json["error-codes"] });
      return "failed";
    }
    if (testSecret) return "ok";
    if (json.action !== TURNSTILE_ACTION) {
      logger.warn("turnstile action mismatch", { action: json.action });
      return "failed";
    }
    const host = json.hostname?.toLowerCase();
    if (!host || !expectedHostnames().has(host)) {
      logger.warn("turnstile hostname mismatch", { hostname: json.hostname });
      return "failed";
    }
    return "ok";
  } catch (err) {
    logger.warn("turnstile verify error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}
