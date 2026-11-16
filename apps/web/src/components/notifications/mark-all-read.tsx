"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@plunderclips/ui/components/button";
import { markReadAction } from "@/app/notifications/actions";

export function MarkAllRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await markReadAction();
          router.refresh();
        })
      }
    >
      Mark all read
    </Button>
  );
}
