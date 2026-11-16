"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { openDmAction } from "@/app/chat/actions";

/** Opens (or reopens) a conversation with this creator. */
export function MessageButton({ userId, handle }: { userId: string; handle: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant="secondary"
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setNote(await openDmAction(userId, handle));
          })
        }
      >
        {pending ? <Loader2 className="size-5 animate-spin" /> : null}
        Message
      </Button>
      {note ? (
        <p role="status" className="text-muted-foreground mt-2 text-sm">
          {note}
        </p>
      ) : null}
    </div>
  );
}
