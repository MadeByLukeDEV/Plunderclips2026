import { redis } from "./redis";

export type RateLimitResult =
  { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

// Sliding-window log, atomic in Redis. Rejected attempts are not counted, so the window keeps sliding.
// KEYS[1] = sorted set · ARGV = now ms, window ms, limit, unique member
const SCRIPT = `
local key, now, window, limit = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
redis.call("ZREMRANGEBYSCORE", key, 0, now - window)
local count = redis.call("ZCARD", key)
if count >= limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  return {0, tonumber(oldest[2]) + window - now}
end
redis.call("ZADD", key, now, ARGV[4])
redis.call("PEXPIRE", key, window)
return {1, limit - count - 1}
`;

/**
 * Allows `limit` hits per `windowSeconds` for one key. Fails open (allows) if Redis is down,
 * so an outage doesn't block every visitor; callers that must fail closed check `redis().status`.
 */
export async function slidingWindow(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const [allowed, value] = (await redis().eval(
      SCRIPT,
      1,
      `rl:${key}`,
      now,
      windowSeconds * 1000,
      limit,
      member,
    )) as [number, number];
    return allowed === 1
      ? { ok: true, remaining: value }
      : { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(value / 1000)) };
  } catch {
    return { ok: true, remaining: 0 };
  }
}
