import { eq } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { env, hashIp, logger, slidingWindow, type RateLimitResult } from "@plunderclips/shared";
import type { FetchLike } from "./http";
import { fetchClipMetadata, type ClipMetadata } from "./metadata";
import type { ParsedClip, ParseError } from "./parse";
import { resolveClipUrl } from "./resolve";
import { verifyTurnstile, type TurnstileResult } from "./turnstile";
import { twitchAppAuth } from "./twitch-token";

export const TITLE_MAX = 120;
export const NOTE_MAX = 280;

export type ClipStatus = "pending" | "approved" | "rejected";

export type Submitter = {
  /** Signed-in user, or null for an anonymous visitor. */
  userId: string | null;
  /** Has clip:publish-direct (creator, mod, admin): skips the review queue. */
  trusted: boolean;
  ip: string | null;
};

export type SubmitInput = {
  url: string;
  /** Used only when the platform gives no title. */
  title?: string | null;
  note?: string | null;
  turnstileToken?: string | null;
};

export type SubmitError =
  | ParseError
  | "captcha_failed"
  | "rate_limited"
  | "title_required"
  | "title_too_long"
  | "note_too_long";

export type SubmittedClip = {
  id: string;
  status: ClipStatus;
  title: string;
  thumbnailUrl: string | null;
  canonicalUrl: string;
};

export type SubmitResult =
  | { ok: true; duplicate: boolean; clip: SubmittedClip }
  | { ok: false; error: SubmitError; retryAfterSeconds?: number };

type Row = typeof schema.clip.$inferSelect;
type NewRow = typeof schema.clip.$inferInsert;

/** Everything submitClip touches outside itself, so tests can swap it. */
export type SubmitDeps = {
  findByKey: (key: string) => Promise<Row | undefined>;
  insert: (row: NewRow) => Promise<Row | undefined>;
  verifyTurnstile: (
    token: string | null | undefined,
    ip: string | null,
  ) => Promise<TurnstileResult>;
  rateLimit: (key: string, limit: number, windowSeconds: number) => Promise<RateLimitResult>;
  resolve: (url: string) => ReturnType<typeof resolveClipUrl>;
  metadata: (clip: ParsedClip) => Promise<ClipMetadata | null>;
  hashIp: (ip: string | null) => string | null;
  isProduction: boolean;
  now: () => Date;
};

/** Anonymous: 5 per 10 minutes and 20 per day per IP. Signed in: 30 per hour per account. */
export const LIMITS = {
  anonBurst: { limit: 5, windowSeconds: 10 * 60 },
  anonDaily: { limit: 20, windowSeconds: 24 * 60 * 60 },
  user: { limit: 30, windowSeconds: 60 * 60 },
} as const;

/**
 * Submit a clip by URL. Anonymous and signed-in members land in the review queue (pending);
 * trusted submitters publish directly unless the platform says it's another game.
 * A URL that's already in the library returns the existing clip (duplicate: true).
 */
export async function submitClip(
  input: SubmitInput,
  who: Submitter,
  deps: SubmitDeps = defaultDeps(),
): Promise<SubmitResult> {
  const typedTitle = input.title?.replace(/\s+/g, " ").trim() || null;
  const note = input.note?.trim() || null;
  if (typedTitle && typedTitle.length > TITLE_MAX) return { ok: false, error: "title_too_long" };
  if (note && note.length > NOTE_MAX) return { ok: false, error: "note_too_long" };

  // Signed-in members passed OAuth, so the captcha is only for anonymous visitors.
  if (!who.userId) {
    const captcha = await deps.verifyTurnstile(input.turnstileToken, who.ip);
    if (captcha === "failed" || (captcha === "not_configured" && deps.isProduction))
      return { ok: false, error: "captcha_failed" };
  }

  // Before any outbound request, so a flood can't make us hammer the platforms.
  const ipHash = deps.hashIp(who.ip);
  const limited = await checkLimits(who, ipHash, deps);
  if (limited) return limited;

  const parsed = await deps.resolve(input.url);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const c = parsed.clip;

  const existing = await deps.findByKey(c.key);
  if (existing) return { ok: true, duplicate: true, clip: view(existing) };

  const meta = await deps.metadata(c);
  const title = meta?.title ?? typedTitle;
  if (!title) return { ok: false, error: "title_required" };

  const otherGame = meta?.isSeaOfThieves === false;
  const status: ClipStatus = who.trusted && !otherGame ? "approved" : "pending";
  const now = deps.now();

  const row = await deps.insert({
    key: c.key,
    platform: c.platform,
    kind: c.kind,
    platformId: c.id,
    channel: c.channel ?? null,
    canonicalUrl: c.canonicalUrl,
    embedSrc: meta?.embedSrc ?? null,
    startSeconds: c.startSeconds ?? null,
    title: title.slice(0, 300),
    thumbnailUrl: meta?.thumbnailUrl ?? null,
    authorName: meta?.authorName ?? null,
    authorUrl: meta?.authorUrl ?? null,
    durationSeconds: meta?.durationSeconds ?? null,
    game: meta?.game ?? null,
    isSeaOfThieves: meta?.isSeaOfThieves ?? null,
    status,
    approvedAt: status === "approved" ? now : null,
    submittedByUserId: who.userId,
    submitterIpHash: ipHash,
    submitterNote: note,
  });

  // Someone else submitted the same clip a moment ago: the unique key caught it.
  if (!row) {
    const raced = await deps.findByKey(c.key);
    if (raced) return { ok: true, duplicate: true, clip: view(raced) };
    throw new Error(`clip insert returned nothing for ${c.key}`);
  }

  logger.info("clip submitted", { id: row.id, key: row.key, status, anonymous: !who.userId });
  return { ok: true, duplicate: false, clip: view(row) };
}

async function checkLimits(
  who: Submitter,
  ipHash: string | null,
  deps: SubmitDeps,
): Promise<SubmitResult | null> {
  const checks = who.userId
    ? [[`submit:user:${who.userId}`, LIMITS.user] as const]
    : [
        [`submit:ip:${ipHash ?? "unknown"}:burst`, LIMITS.anonBurst] as const,
        [`submit:ip:${ipHash ?? "unknown"}:day`, LIMITS.anonDaily] as const,
      ];
  for (const [key, { limit, windowSeconds }] of checks) {
    const r = await deps.rateLimit(key, limit, windowSeconds);
    if (!r.ok) return { ok: false, error: "rate_limited", retryAfterSeconds: r.retryAfterSeconds };
  }
  return null;
}

function view(r: Row): SubmittedClip {
  return {
    id: r.id,
    status: r.status,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    canonicalUrl: r.canonicalUrl,
  };
}

function defaultDeps(): SubmitDeps {
  const fetchImpl: FetchLike = fetch;
  return {
    findByKey: async (key) => {
      const [row] = await db().select().from(schema.clip).where(eq(schema.clip.key, key)).limit(1);
      return row;
    },
    insert: async (row) => {
      const [inserted] = await db()
        .insert(schema.clip)
        .values(row)
        .onConflictDoNothing({ target: schema.clip.key })
        .returning();
      return inserted;
    },
    verifyTurnstile: (token, ip) => verifyTurnstile(token, ip, fetchImpl),
    rateLimit: slidingWindow,
    resolve: (url) => resolveClipUrl(url, { fetch: fetchImpl }),
    metadata: (clip) =>
      fetchClipMetadata(clip, { fetch: fetchImpl, twitchAuth: () => twitchAppAuth() }),
    hashIp,
    isProduction: env().NODE_ENV === "production",
    now: () => new Date(),
  };
}
