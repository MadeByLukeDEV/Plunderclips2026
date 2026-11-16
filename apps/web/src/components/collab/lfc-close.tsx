"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@plunderclips/ui/components/button";
import { deleteLfcAction } from "@/app/looking-for-crew/actions";

/** "Close post" for the author, "Remove" for staff. */
export function LfcClose({ postId, label }: { postId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await deleteLfcAction(postId);
            if (r) setNote(r);
            else router.refresh();
          })
        }
      >
        {label}
      </Button>
      {note ? (
        <p role="status" className="text-muted-foreground mt-1 text-sm">
          {note}
        </p>
      ) : null}
    </div>
  );
}
