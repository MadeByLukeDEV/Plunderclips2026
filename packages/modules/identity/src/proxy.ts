import { getSessionCookie } from "better-auth/cookies";

/**
 * Edge-safe check for the proxy: is there a session cookie at all? (Optimistic only; pages still
 * verify the session on the server. Keep this file free of db/redis imports.)
 */
export function hasSessionCookie(request: Request): boolean {
  return Boolean(getSessionCookie(request));
}
