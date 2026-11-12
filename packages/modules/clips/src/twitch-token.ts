import { env, logger, redis } from "@plunderclips/shared";
import type { FetchLike } from "./http";

const KEY = "clips:twitch:app-token";

export type TwitchAuth = { clientId: string; token: string };

/**
 * Twitch app access token (client credentials) for the Helix API, cached in Redis until shortly
 * before it expires. Uses the same TWITCH_CLIENT_ID/SECRET as sign-in. Null when they are not set.
 */
export async function twitchAppAuth(fetchImpl: FetchLike = fetch): Promise<TwitchAuth | null> {
  const e = env();
  if (!e.TWITCH_CLIENT_ID || !e.TWITCH_CLIENT_SECRET) return null;

  const cached = await redis()
    .get(KEY)
    .catch(() => null);
  if (cached) return { clientId: e.TWITCH_CLIENT_ID, token: cached };

  const body = new URLSearchParams({
    client_id: e.TWITCH_CLIENT_ID,
    client_secret: e.TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const res = await fetchImpl("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    logger.warn("twitch app token request failed", { status: res.status });
    return null;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  const ttl = Math.max(60, (json.expires_in ?? 3600) - 300);
  await redis()
    .set(KEY, json.access_token, "EX", ttl)
    .catch(() => {});
  return { clientId: e.TWITCH_CLIENT_ID, token: json.access_token };
}
