"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@plunderclips/ui/components/button";

/** Staff only: takes down an uploaded banner or logo (the server checks the role and logs it). */
export function StaffRemoveImage({ query, label }: { query: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await fetch(`/api/uploads?${query}`, { method: "DELETE" });
            if (res.ok) router.refresh();
            else
              setNote(
                ((await res.json().catch(() => ({}))) as { error?: string }).error ??
                  "Couldn't remove it.",
              );
          })
        }
      >
        {label}
      </Button>
      {note ? (
        <p role="status" className="text-muted-foreground mt-2 text-sm">
          {note}
        </p>
      ) : null}
    </div>
  );
}
