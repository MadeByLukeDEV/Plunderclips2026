import Redis from "ioredis";
import { env } from "./env";

const globalForRedis = globalThis as unknown as { __redis?: Redis };

/** Single shared connection; reused across hot reloads in dev. */
export function redis(): Redis {
  if (!globalForRedis.__redis) {
    globalForRedis.__redis = new Redis(env().REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
  }
  return globalForRedis.__redis;
}
