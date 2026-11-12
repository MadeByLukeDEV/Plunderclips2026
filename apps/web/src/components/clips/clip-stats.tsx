import { headers } from "next/headers";
import { connection } from "next/server";
import { getClipCounts, hasVoted, pendingViews } from "@plunderclips/clips";
import { currentVoter } from "@/lib/voter";
import { VoteButton } from "./vote-button";

/** Live votes, views and "did I vote" for the clip page. Not cached: it depends on the visitor. */
export async function ClipStats({ clipId }: { clipId: string }) {
  // Request-time only: per-visitor data, and new DB connections make random auth nonces.
  await connection();
  const voter = await currentVoter(await headers());
  const [counts, voted, pending] = await Promise.all([
    getClipCounts(clipId),
    hasVoted(clipId, voter),
    pendingViews(clipId),
  ]);
  if (!counts) return null;
  const views = counts.viewCount + pending;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <VoteButton clipId={clipId} initial={{ voted, votes: counts.voteCount }} />
      <p className="text-muted-foreground font-mono text-sm tabular-nums">
        {views.toLocaleString("en-GB")} {views === 1 ? "view" : "views"}
      </p>
    </div>
  );
}

export function ClipStatsSkeleton() {
  return <div className="bg-card h-11 w-36 animate-pulse rounded-lg" aria-hidden />;
}
