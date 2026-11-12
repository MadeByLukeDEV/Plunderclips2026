"use server";

import { headers } from "next/headers";
import { setVote } from "@plunderclips/clips";
import { currentVoter } from "@/lib/voter";

export type VoteState = { voted: boolean; votes: number; error?: string };

/**
 * Sets the visitor's vote on a clip. Cached lists aren't expired on every vote (that would
 * thrash the cache); their counts catch up within minutes, the clip page reads live.
 */
export async function voteAction(clipId: string, on: boolean): Promise<VoteState | null> {
  const voter = await currentVoter(await headers());
  const r = await setVote(clipId, voter, on);
  // null tells the button to roll back (rate limited, clip gone, no way to identify the visitor).
  return r.ok ? { voted: r.voted, votes: r.votes } : null;
}
