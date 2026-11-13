import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  // OAuth providers are optional until each one is configured.
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  KICK_CLIENT_ID: z.string().optional(),
  KICK_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Better Auth hosted dashboard (@better-auth/infra); off unless the key is set.
  BETTER_AUTH_API_KEY: z.string().optional(),
  BETTER_AUTH_API_URL: z.url().optional(),
  BETTER_AUTH_KV_URL: z.url().optional(),
  // Local test accounts with email + password (never active in production).
  DEV_LOGIN: z.enum(["true", "false"]).optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  IP_HASH_SALT: z.string().min(16).optional(),
  // Client IP (see ip.ts): proxies we trust, counted from the right of X-Forwarded-For, or one
  // header a CDN sets (e.g. cf-connecting-ip). Defaults fit Dokploy's Traefik alone.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
  CLIENT_IP_HEADER: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/i)
    .optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * Parsed lazily so `next build` inside Docker works without runtime secrets.
 * Throws with a readable list of missing/invalid keys on first access.
 */
export function env(): ServerEnv {
  if (cached) return cached;
  // An empty variable counts as unset: compose passes `${VAR:-}` as "", which would otherwise fail
  // patterns like CLIENT_IP_HEADER's or count as "configured" for optional keys.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = serverSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
