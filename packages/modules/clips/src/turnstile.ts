import { env, logger } from "@plunderclips/shared";
import type { FetchLike } from "./http";

export type TurnstileResult = "ok" | "failed" | "not_configured";

/**
 * Verifies a Cloudflare Turnstile token on the server (siteverify).
 * Without TURNSTILE_SECRET_KEY: "not_configured". The caller allows that only outside production.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<TurnstileResult> {
  const secret = env().TURNSTILE_SECRET_KEY;
  if (!secret) return "not_configured";
  if (!token || token.length > 2048) return "failed";

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (json.success === true) return "ok";
    logger.info("turnstile rejected", { codes: json["error-codes"] });
    return "failed";
  } catch (err) {
    logger.warn("turnstile verify error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}
