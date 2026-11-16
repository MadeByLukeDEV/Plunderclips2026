import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, lastLoginMethod } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { dash } from "@better-auth/infra";
import { db, schema } from "@plunderclips/db";
import { env } from "@plunderclips/shared";
import { ac, roles } from "./permissions";
import { redisStorage } from "./redis-storage";

type SocialProviders = NonNullable<BetterAuthOptions["socialProviders"]>;

/** Internal header carrying the trusted client IP from the route handler to Better Auth. */
export const CLIENT_IP_HEADER = "x-plunderclips-client-ip";

export const SUPPORTED_PROVIDERS = ["twitch", "discord", "kick", "google"] as const;
export type ProviderId = (typeof SUPPORTED_PROVIDERS)[number];

/** Only providers whose credentials are configured are offered. */
function socialProviders(): SocialProviders {
  const e = env();
  const providers: SocialProviders = {};
  if (e.TWITCH_CLIENT_ID && e.TWITCH_CLIENT_SECRET)
    providers.twitch = { clientId: e.TWITCH_CLIENT_ID, clientSecret: e.TWITCH_CLIENT_SECRET };
  if (e.DISCORD_CLIENT_ID && e.DISCORD_CLIENT_SECRET)
    providers.discord = { clientId: e.DISCORD_CLIENT_ID, clientSecret: e.DISCORD_CLIENT_SECRET };
  if (e.KICK_CLIENT_ID && e.KICK_CLIENT_SECRET)
    providers.kick = { clientId: e.KICK_CLIENT_ID, clientSecret: e.KICK_CLIENT_SECRET };
  if (e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET)
    providers.google = {
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      // YouTube channel info for creator profiles, read-only.
      scope: ["https://www.googleapis.com/auth/youtube.readonly"],
    };
  return providers;
}

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "Plunderclips",
    telemetry: { enabled: false },
    baseURL: e.BETTER_AUTH_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    secondaryStorage: redisStorage(),
    socialProviders: socialProviders(),
    // Email + password only for local dev test users (see dev-login.ts). Nobody can sign up with it.
    emailAndPassword: {
      enabled: e.NODE_ENV !== "production" && e.DEV_LOGIN === "true",
      disableSignUp: true,
    },
    session: {
      // Sessions live in Redis (fast lookups) and in Postgres (so admins can list and revoke them).
      storeSessionInDatabase: true,
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: {
      accountLinking: {
        enabled: true,
        // No silent merging on sign-in: another platform is linked only by a signed-in user, from the dashboard.
        disableImplicitLinking: true,
        // Streamers often use a different email per platform. Safe here because linking needs an active session.
        allowDifferentEmails: true,
        allowUnlinkingAll: false,
      },
    },
    rateLimit: { enabled: true, storage: "secondary-storage" },
    advanced: {
      useSecureCookies: e.NODE_ENV === "production",
      // Set by our route handler from clientIp() (any copy the client sends is dropped there), so
      // Better Auth's rate limits use the same trusted IP as the rest of the app.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    plugins: [
      admin({ ac, roles, defaultRole: "user", adminRoles: ["admin"] }),
      lastLoginMethod(),
      // Better Auth dashboard (hosted): only with an API key. It sends auth events to Better Auth's cloud.
      ...(e.BETTER_AUTH_API_KEY
        ? [
            dash({
              apiKey: e.BETTER_AUTH_API_KEY,
              apiUrl: e.BETTER_AUTH_API_URL,
              kvUrl: e.BETTER_AUTH_KV_URL,
            }),
          ]
        : []),
      nextCookies(), // must stay last
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __auth?: Auth };

/** Built on first use, so `next build` never needs runtime secrets. */
export function getAuth(): Auth {
  globalForAuth.__auth ??= createAuth();
  return globalForAuth.__auth;
}

/** Providers configured right now (drives the sign-in page and the link buttons). */
export function enabledProviders(): ProviderId[] {
  return Object.keys(socialProviders()) as ProviderId[];
}
