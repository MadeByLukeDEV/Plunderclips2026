"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Anchor } from "lucide-react";
import { cn } from "@plunderclips/ui/lib/utils";
import { voteAction, type VoteState } from "@/app/clip/[id]/actions";

/**
 * "Raise the anchor": the one vote a visitor can give a clip. Optimistic; rolls back if the
 * server says no (rate limit, clip gone).
 */
export function VoteButton({ clipId, initial }: { clipId: string; initial: VoteState }) {
  const [state, setState] = useState(initial);
  const [optimistic, setOptimistic] = useOptimistic(state);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function toggle() {
    const on = !optimistic.voted;
    setNote(null);
    startTransition(async () => {
      setOptimistic({ voted: on, votes: Math.max(0, optimistic.votes + (on ? 1 : -1)) });
      const r = await voteAction(clipId, on);
      if (r) setState(r);
      else setNote("That vote didn't go through. Try again in a minute.");
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={optimistic.voted}
        disabled={pending}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 font-medium transition-[transform,background-color,color] duration-150 active:scale-[0.97]",
          optimistic.voted
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border hover:bg-card",
        )}
      >
        <Anchor className="size-4" aria-hidden />
        <span>{optimistic.voted ? "Voted" : "Vote"}</span>
        <span className="font-mono text-sm tabular-nums" aria-label={`${optimistic.votes} votes`}>
          {optimistic.votes}
        </span>
      </button>
      {note ? (
        <p role="status" className="text-muted-foreground mt-2 text-sm">
          {note}
        </p>
      ) : null}
    </div>
  );
}
