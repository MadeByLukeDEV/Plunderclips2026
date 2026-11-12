import { Suspense } from "react";
import Link from "next/link";
import { listAudit, openReportCount, queueCounts } from "@plunderclips/moderation";
import { requireStaff } from "@/lib/staff";
import { AuditTable } from "@/components/admin/audit-table";

export default function AdminOverview() {
  return (
    <div>
      <h1 className="text-h2">Moderation</h1>
      <Suspense fallback={<div className="bg-card mt-8 h-64 animate-pulse rounded-2xl" />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  await requireStaff("/admin");
  const [counts, reports, recent] = await Promise.all([
    queueCounts(),
    openReportCount(),
    listAudit(),
  ]);
  const tiles = [
    { label: "Waiting for review", value: counts.pending, href: "/admin/queue" },
    { label: "Open reports", value: reports, href: "/admin/reports" },
    { label: "Published", value: counts.approved, href: "/admin/queue?status=approved" },
    { label: "Rejected", value: counts.rejected, href: "/admin/queue?status=rejected" },
  ];
  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="lift border-border bg-card rounded-2xl border p-5"
          >
            <div>
              <dt className="text-muted-foreground text-sm">{t.label}</dt>
              <dd className="mt-2 font-mono text-3xl tabular-nums">
                {t.value.toLocaleString("en-GB")}
              </dd>
            </div>
          </Link>
        ))}
      </dl>
      <section aria-labelledby="recent-title" className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="recent-title" className="text-h3 font-medium">
            Recent actions
          </h2>
          <Link href="/admin/audit" className="link-draw text-muted-foreground text-sm">
            Full audit log
          </Link>
        </div>
        <div className="mt-5">
          <AuditTable rows={recent.rows.slice(0, 10)} />
        </div>
      </section>
    </>
  );
}
