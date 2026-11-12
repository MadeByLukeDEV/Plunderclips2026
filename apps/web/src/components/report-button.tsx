"use client";

import { useActionState, useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { reportAction, type ReportState } from "@/app/report-actions";

type Props = {
  targetType: "clip" | "creator";
  targetId: string;
  reasons: Record<string, string>;
};

const field =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]";

/** A quiet "Report" link that opens a short form in place. */
export function ReportButton({ targetType, targetId, reasons }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ReportState, FormData>(
    reportAction.bind(null, { targetType, targetId }),
    { status: "idle" },
  );

  if (state.status === "done")
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Thanks. A mod will take a look.
      </p>
    );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-2 text-sm transition-colors"
      >
        <Flag className="size-4" aria-hidden />
        Report {targetType === "clip" ? "this clip" : "this page"}
      </button>
    );

  return (
    <form action={action} className="border-border grid max-w-md gap-3 rounded-xl border p-4">
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium">What&apos;s wrong?</legend>
        {Object.entries(reasons)
          .filter(([k]) => targetType === "creator" || k !== "impersonation")
          .map(([k, label]) => (
            <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="radio"
                name="reason"
                value={k}
                required
                className="accent-primary size-4"
              />
              {label}
            </label>
          ))}
      </fieldset>
      <label className="grid gap-1.5 text-sm">
        Anything we should know? <span className="text-muted-foreground">(optional)</span>
        <textarea name="note" rows={2} maxLength={500} className={`${field} py-2`} />
      </label>
      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          Send report
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
