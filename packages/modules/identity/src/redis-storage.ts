import type { SecondaryStorage } from "better-auth";
import { redis } from "@plunderclips/shared";

const PREFIX = "auth:";

/** Better Auth secondary storage on Redis: sessions, rate limits and verification values. */
export function redisStorage(): SecondaryStorage {
  const r = () => redis();
  return {
    get: (key) => r().get(PREFIX + key),
    getAndDelete: (key) => r().getdel(PREFIX + key),
    async set(key, value, ttl) {
      if (ttl && ttl > 0) await r().set(PREFIX + key, value, "EX", Math.ceil(ttl));
      else await r().set(PREFIX + key, value);
    },
    async delete(key) {
      await r().del(PREFIX + key);
    },
    // The TTL is set only when the counter is created, so the window is fixed (as the interface requires).
    async increment(key, ttl) {
      const k = PREFIX + key;
      const results = await r()
        .multi()
        .set(k, 0, "EX", Math.max(1, Math.ceil(ttl)), "NX")
        .incr(k)
        .exec();
      const incr = results?.[1];
      if (!incr || incr[0]) throw incr?.[0] ?? new Error("redis increment failed");
      return Number(incr[1]);
    },
  };
}
