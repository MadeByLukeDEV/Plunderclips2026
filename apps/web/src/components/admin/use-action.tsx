"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/admin/actions";

/** Runs an admin action, shows its message, and refreshes the page data when it worked. */
export function useAdminAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function run(fn: () => Promise<ActionResult>) {
    setResult(null);
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return { pending, result, run };
}

export function ActionMessage({ result }: { result: ActionResult | null }) {
  if (!result?.message) return null;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={result.ok ? "text-sm" : "text-destructive text-sm"}
    >
      {result.message}
    </p>
  );
}
