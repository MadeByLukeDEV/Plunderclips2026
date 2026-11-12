import { Suspense } from "react";
import {
  REJECT_REASONS,
  REPORT_REASONS,
  canTriageReports,
  listOpenReports,
} from "@plunderclips/moderation";
import { ReportGroup } from "@/components/admin/report-group";
import { requireStaff } from "@/lib/staff";

export default function ReportsPage() {
  return (
    <div>
      <h1 className="text-h2">Reports</h1>
      <p className="text-muted-foreground mt-3 max-w-[60ch]">
        Open reports, grouped by what they&apos;re about, most-reported first. Closing a group closes
        every report in it.
      </p>
      <Suspense fallback={<div className="bg-card mt-8 h-72 animate-pulse rounded-2xl" />}>
        <Reports />
      </Suspense>
    </div>
  );
}

async function Reports() {
  const { actor } = await requireStaff("/admin/reports");
  if (!canTriageReports(actor))
    return <p className="text-muted-foreground mt-8">Your role can&apos;t handle reports.</p>;
  const groups = await listOpenReports(actor);
  if (!groups.length)
    return (
      <div className="border-border mt-8 rounded-2xl border border-dashed p-10 text-center">
        <p className="text-h3 font-medium">No open reports</p>
        <p className="text-muted-foreground mx-auto mt-3 max-w-[44ch]">
          Visitors can report a clip or a creator page. Those reports land here.
        </p>
      </div>
    );
  return (
    <div className="mt-8 grid gap-4">
      {groups.map((g) => (
        <ReportGroup
          key={`${g.targetType}:${g.targetId}`}
          group={{
            ...g,
            reports: g.reports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
          }}
          reasons={REPORT_REASONS}
          rejectReasons={REJECT_REASONS}
        />
      ))}
    </div>
  );
}
