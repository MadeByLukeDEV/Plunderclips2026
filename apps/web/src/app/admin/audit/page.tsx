import { Suspense } from "react";
import Link from "next/link";
import { listAudit } from "@plunderclips/moderation";
import { Button } from "@plunderclips/ui/components/button";
import { cn } from "@plunderclips/ui/lib/utils";
import { AuditTable } from "@/components/admin/audit-table";
import { requireStaff } from "@/lib/staff";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTERS = [
  ["", "Everything"],
  ["clip.approve", "Published"],
  ["clip.reject", "Rejected"],
  ["clip.unpublish", "Taken down"],
  ["user.ban", "Bans"],
  ["user.role", "Roles"],
] as const;

export default function AuditPage({ searchParams }: Props) {
  return (
    <div>
      <h1 className="text-h2">Audit log</h1>
      <p className="text-muted-foreground mt-3 max-w-[60ch]">
        Every moderation action: who did what, and when. Nothing here can be edited.
      </p>
      <Suspense fallback={<div className="bg-card mt-8 h-72 animate-pulse rounded-2xl" />}>
        <Log searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Log({ searchParams }: Props) {
  await requireStaff("/admin/audit");
  const sp = await searchParams;
  const action = FILTERS.find(([a]) => a === sp.action)?.[0] ?? "";
  const after = typeof sp.after === "string" ? sp.after : null;
  const { rows, nextCursor } = await listAudit({ action: action || null, cursor: after });
  return (
    <>
      <nav aria-label="Filter" className="mt-8 flex flex-wrap gap-1">
        {FILTERS.map(([a, label]) => (
          <Link
            key={a || "all"}
            href={a ? `/admin/audit?action=${a}` : "/admin/audit"}
            aria-current={a === action ? "true" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-lg px-4 text-sm transition-colors",
              a === action
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        <AuditTable rows={rows} />
      </div>
      {nextCursor ? (
        <div className="mt-6">
          <Button asChild variant="secondary">
            <Link
              href={`/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), after: nextCursor })}`}
            >
              Older entries
            </Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}
