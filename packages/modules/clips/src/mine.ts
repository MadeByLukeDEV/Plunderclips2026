import { and, count, desc, eq, lt, or, sum } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import type { ClipStatus } from "./submit";

const { clip } = schema;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A member's own submission, with the review fields the public view leaves out. */
export type MyClip = {
  id: string;
  platform: "twitch" | "youtube" | "kick" | "medal" | "tiktok" | "x";
  title: string;
  thumbnailUrl: string | null;
  canonicalUrl: string;
  status: ClipStatus;
  rejectReason: string | null;
  voteCount: number;
  viewCount: number;
  createdAt: Date;
};

export type MyClipsPage = { clips: MyClip[]; nextCursor: string | null };

const PAGE = 20;

/** Clips the member submitted while signed in, newest first, optionally one status. */
export async function listMyClips(
  userId: string,
  opts: { status?: ClipStatus | null; cursor?: string | null } = {},
): Promise<MyClipsPage> {
  const where = [eq(clip.submittedByUserId, userId)];
  if (opts.status) where.push(eq(clip.status, opts.status));
  const cursor = decode(opts.cursor);
  if (cursor)
    where.push(
      or(
        lt(clip.createdAt, cursor.at),
        and(eq(clip.createdAt, cursor.at), lt(clip.id, cursor.id)),
      )!,
    );
  const rows = await db()
    .select({
      id: clip.id,
      platform: clip.platform,
      title: clip.title,
      thumbnailUrl: clip.thumbnailUrl,
      canonicalUrl: clip.canonicalUrl,
      status: clip.status,
      rejectReason: clip.rejectReason,
      voteCount: clip.voteCount,
      viewCount: clip.viewCount,
      createdAt: clip.createdAt,
    })
    .from(clip)
    .where(and(...where))
    .orderBy(desc(clip.createdAt), desc(clip.id))
    .limit(PAGE + 1);
  const clips = rows.slice(0, PAGE);
  const last = clips.at(-1);
  return {
    clips,
    nextCursor:
      rows.length > PAGE && last
        ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString("base64url")
        : null,
  };
}

function decode(v: string | null | undefined): { at: Date; id: string } | null {
  if (!v || v.length > 200) return null;
  const [iso, id] = Buffer.from(v, "base64url").toString("utf8").split("|");
  const at = iso ? new Date(iso) : null;
  return at && !Number.isNaN(at.getTime()) && id && UUID.test(id) ? { at, id } : null;
}

export type MyClipStats = {
  pending: number;
  approved: number;
  rejected: number;
  /** Votes and views on their approved clips. */
  votes: number;
  views: number;
};

export async function myClipStats(userId: string): Promise<MyClipStats> {
  const rows = await db()
    .select({
      status: clip.status,
      n: count(),
      votes: sum(clip.voteCount),
      views: sum(clip.viewCount),
    })
    .from(clip)
    .where(eq(clip.submittedByUserId, userId))
    .groupBy(clip.status);
  const stats: MyClipStats = { pending: 0, approved: 0, rejected: 0, votes: 0, views: 0 };
  for (const r of rows) {
    stats[r.status] = Number(r.n);
    if (r.status === "approved") {
      stats.votes = Number(r.votes ?? 0);
      stats.views = Number(r.views ?? 0);
    }
  }
  return stats;
}

export type WithdrawResult = { ok: true } | { ok: false; error: "not_found" | "not_pending" };

/** A member can take back their own clip while it's still waiting for review. */
export async function withdrawClip(userId: string, clipId: string): Promise<WithdrawResult> {
  if (!UUID.test(clipId)) return { ok: false, error: "not_found" };
  const deleted = await db()
    .delete(clip)
    .where(and(eq(clip.id, clipId), eq(clip.submittedByUserId, userId), eq(clip.status, "pending")))
    .returning({ id: clip.id });
  if (deleted.length) return { ok: true };
  const [exists] = await db()
    .select({ status: clip.status })
    .from(clip)
    .where(and(eq(clip.id, clipId), eq(clip.submittedByUserId, userId)))
    .limit(1);
  return { ok: false, error: exists ? "not_pending" : "not_found" };
}
