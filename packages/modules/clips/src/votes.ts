import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { slidingWindow } from "@plunderclips/shared";

const { clip, clipVote } = schema;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who is voting: a member by id, or an anonymous visitor by salted IP hash. */
export type Voter = { userId: string } | { ipHash: string };

export function voterKey(v: Voter): string {
  return "userId" in v ? `u:${v.userId}` : `ip:${v.ipHash}`;
}

export type VoteResult =
  | { ok: true; voted: boolean; votes: number }
  | { ok: false; error: "not_found" | "rate_limited" | "no_voter" };

/** 30 vote changes per minute per voter is plenty for a person and stops scripted flipping. */
export const VOTE_LIMIT = { limit: 30, windowSeconds: 60 } as const;

/**
 * Sets or clears a vote. The vote row and clip.vote_count change in one transaction,
 * so the counter can't drift; voting twice or unvoting twice is a no-op.
 */
export async function setVote(
  clipId: string,
  voter: Voter | null,
  on: boolean,
): Promise<VoteResult> {
  if (!voter) return { ok: false, error: "no_voter" };
  if (!UUID.test(clipId)) return { ok: false, error: "not_found" };
  const key = voterKey(voter);

  const limited = await slidingWindow(`vote:${key}`, VOTE_LIMIT.limit, VOTE_LIMIT.windowSeconds);
  if (!limited.ok) return { ok: false, error: "rate_limited" };

  return db().transaction(async (tx) => {
    // Lock the clip row: concurrent votes on one clip queue up instead of racing the counter.
    const [target] = await tx
      .select({ id: clip.id, votes: clip.voteCount })
      .from(clip)
      .where(and(eq(clip.id, clipId), eq(clip.status, "approved")))
      .for("update");
    if (!target) return { ok: false as const, error: "not_found" as const };

    let delta = 0;
    if (on) {
      const inserted = await tx
        .insert(clipVote)
        .values({ clipId, voterKey: key, userId: "userId" in voter ? voter.userId : null })
        .onConflictDoNothing()
        .returning({ clipId: clipVote.clipId });
      delta = inserted.length;
    } else {
      const deleted = await tx
        .delete(clipVote)
        .where(and(eq(clipVote.clipId, clipId), eq(clipVote.voterKey, key)))
        .returning({ clipId: clipVote.clipId });
      delta = -deleted.length;
    }

    if (delta === 0) return { ok: true as const, voted: on, votes: target.votes };
    const [updated] = await tx
      .update(clip)
      .set({ voteCount: sql`greatest(${clip.voteCount} + ${delta}, 0)` })
      .where(eq(clip.id, clipId))
      .returning({ votes: clip.voteCount });
    return { ok: true as const, voted: on, votes: updated!.votes };
  });
}

/** Has this voter voted for the clip? */
export async function hasVoted(clipId: string, voter: Voter | null): Promise<boolean> {
  if (!voter || !UUID.test(clipId)) return false;
  const [row] = await db()
    .select({ clipId: clipVote.clipId })
    .from(clipVote)
    .where(and(eq(clipVote.clipId, clipId), eq(clipVote.voterKey, voterKey(voter))))
    .limit(1);
  return !!row;
}
