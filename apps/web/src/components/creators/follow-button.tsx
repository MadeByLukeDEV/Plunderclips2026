"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@plunderclips/ui/components/button";
import { followAction, type FollowState } from "@/app/c/[handle]/actions";

function count(n: number) {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? "follower" : "followers"}`;
}

export function FollowButton({
  creatorId,
  handle,
  initial,
  signedIn,
}: {
  creatorId: string;
  handle: string;
  initial: FollowState;
  signedIn: boolean;
}) {
  const [state, setState] = useState(initial);
  const [optimistic, setOptimistic] = useOptimistic(state);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button asChild size="lg">
          <Link href={`/sign-in?next=/c/${handle}`}>Follow</Link>
        </Button>
        <p className="text-muted-foreground font-mono text-sm tabular-nums">
          {count(state.followers)}
        </p>
      </div>
    );
  }

  function toggle() {
    const on = !optimistic.following;
    setNote(null);
    startTransition(async () => {
      setOptimistic({
        following: on,
        followers: Math.max(0, optimistic.followers + (on ? 1 : -1)),
      });
      const r = await followAction(creatorId, on);
      if (r) setState(r);
      else setNote("That didn't go through. Try again in a minute.");
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          size="lg"
          variant={optimistic.following ? "secondary" : "default"}
          onClick={toggle}
          disabled={pending}
          aria-pressed={optimistic.following}
        >
          {optimistic.following ? "Following" : "Follow"}
        </Button>
        <p className="text-muted-foreground font-mono text-sm tabular-nums">
          {count(optimistic.followers)}
        </p>
      </div>
      {note ? (
        <p role="status" className="text-muted-foreground mt-2 text-sm">
          {note}
        </p>
      ) : null}
    </div>
  );
}
