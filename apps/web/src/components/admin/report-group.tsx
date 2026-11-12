"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@plunderclips/ui/components/button";
import { resolveAction } from "@/app/admin/actions";
import { formatDate } from "@/components/clips/clip-meta";
import { ActionMessage, useAdminAction } from "./use-action";

export type ReportGroupView = {
  targetType: "clip" | "creator";
  targetId: string;
  label: string | null;
  href: string | null;
  targetStatus: string | null;
  reports: {
    id: string;
    reason: string;
    note: string | null;
    reporterName: string | null;
    createdAt: string;
  }[];
};

const field =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]";

export function ReportGroup({
  group,
  reasons,
  rejectReasons,
}: {
  group: ReportGroupView;
  reasons: Record<string, string>;
  rejectReasons: Record<string, string>;
}) {
  const { pending, result, run } = useAdminAction();
  const [takingDown, setTakingDown] = useState(false);
  const target = { targetType: group.targetType, targetId: group.targetId };
  const canTakeDown = group.targetType === "clip" && group.targetStatus === "approved";

  // A React form action, not onSubmit: before hydration the form can\'t fall back to a native GET.
  const submit = (action: string) => (form: FormData) => {
    form.set("action", action);
    run(() => resolveAction(target, form));
  };

  return (
    <article
      className="border-border bg-card rounded-2xl border p-5"
      aria-label={`Reports about ${group.label ?? "a removed item"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
            {group.targetType === "clip" ? "Clip" : "Creator page"} · {group.reports.length}{" "}
            {group.reports.length === 1 ? "report" : "reports"}
            {group.targetStatus &&
            group.targetStatus !== "approved" &&
            group.targetStatus !== "active"
              ? ` · ${group.targetStatus}`
              : ""}
          </p>
          <h2 className="mt-1 truncate font-medium">
            {group.href ? (
              <Link href={group.href} className="link-draw" target="_blank">
                {group.label}
              </Link>
            ) : (
              (group.label ?? "Removed")
            )}
          </h2>
        </div>
        {group.targetType === "creator" ? (
          <Link
            href={`/admin/users?q=${encodeURIComponent(group.label ?? "")}`}
            className="link-draw text-sm"
          >
            Find the member
          </Link>
        ) : null}
      </div>

      <ul className="divide-border mt-4 divide-y text-sm">
        {group.reports.map((r) => (
          <li key={r.id} className="py-2.5">
            <span className="font-medium">{reasons[r.reason] ?? r.reason}</span>
            <span className="text-muted-foreground">
              {" "}
              · {r.reporterName ?? "anonymous"} · {formatDate(r.createdAt)}
            </span>
            {r.note ? <p className="text-muted-foreground mt-1">{r.note}</p> : null}
          </li>
        ))}
      </ul>

      {result?.ok ? (
        <div className="mt-4">
          <ActionMessage result={result} />
        </div>
      ) : takingDown ? (
        <form action={submit("take_down")} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm">
            Reason (the submitter sees it)
            <select name="reason" className={field} defaultValue="rules">
              {Object.entries(rejectReasons).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="destructive" disabled={pending}>
            Take down and close
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setTakingDown(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <ActionMessage result={result} />
        </form>
      ) : (
        <form action={submit("dismiss")} className="mt-4 flex flex-wrap items-center gap-3">
          {canTakeDown ? (
            <Button type="button" variant="destructive" onClick={() => setTakingDown(true)}>
              Take down
            </Button>
          ) : null}
          <Button type="submit" variant="secondary" disabled={pending}>
            {group.targetType === "clip" && !canTakeDown ? "Close reports" : "Dismiss"}
          </Button>
          <ActionMessage result={result} />
        </form>
      )}
    </article>
  );
}
