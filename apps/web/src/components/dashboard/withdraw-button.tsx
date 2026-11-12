"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { withdrawAction } from "@/app/dashboard/clips/actions";

/** Two-step: "Withdraw" asks once more before deleting, since it can't be undone. */
export function WithdrawButton({ clipId, title }: { clipId: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Withdraw
      </Button>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={`Withdraw "${title}"?`}
    >
      <span className="text-muted-foreground text-sm">Withdraw it?</span>
      <Button
        variant="destructive"

        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await withdrawAction(clipId);
            if (r.ok) router.refresh();
            else {
              setMessage(r.message ?? "That didn't work.");
              setConfirming(false);
            }
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Yes, withdraw
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        Keep it
      </Button>
      {message ? (
        <p role="status" className="text-muted-foreground w-full text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
