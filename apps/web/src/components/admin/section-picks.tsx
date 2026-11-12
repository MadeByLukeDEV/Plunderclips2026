"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { arrangeAction } from "@/app/admin/actions";
import { ClipThumb } from "@/components/clips/clip-thumb";
import { ActionMessage, useAdminAction } from "./use-action";

type Pick = {
  clipId: string;
  title: string;
  thumbnailUrl: string | null;
  platform: "twitch" | "youtube" | "kick" | "medal" | "tiktok" | "x";
};

/** Reorder or remove a section's picks, then save the whole order in one go. */
export function SectionPicks({
  slug,
  period,
  picks,
}: {
  slug: string;
  period: string;
  picks: Pick[];
}) {
  const [order, setOrder] = useState(picks);
  const { pending, result, run } = useAdminAction();
  const dirty = order.map((p) => p.clipId).join() !== picks.map((p) => p.clipId).join();

  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const n = [...o];
      const j = i + d;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  if (!picks.length)
    return (
      <p className="border-border text-muted-foreground mt-6 rounded-2xl border border-dashed p-8 text-center">
        No picks yet. Tick this section on a clip in the review queue to add it.
      </p>
    );

  return (
    <div className="mt-6">
      <ol className="divide-border border-border bg-card divide-y rounded-2xl border">
        {order.map((p, i) => (
          <li key={p.clipId} className="flex items-center gap-4 p-3">
            <span className="text-muted-foreground w-6 text-right font-mono text-sm tabular-nums">
              {i + 1}
            </span>
            <ClipThumb clip={p} className="w-24 shrink-0 rounded-md" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move "${p.title}" up`}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                aria-label={`Move "${p.title}" down`}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOrder((o) => o.filter((x) => x.clipId !== p.clipId))}
                aria-label={`Remove "${p.title}" from this section`}
              >
                <X className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={!dirty || pending}
          onClick={() =>
            run(() =>
              arrangeAction(
                slug,
                period,
                order.map((p) => p.clipId),
              ),
            )
          }
        >
          Save order
        </Button>
        {dirty ? (
          <Button variant="ghost" onClick={() => setOrder(picks)} disabled={pending}>
            Undo changes
          </Button>
        ) : null}
        <ActionMessage result={result} />
      </div>
    </div>
  );
}
