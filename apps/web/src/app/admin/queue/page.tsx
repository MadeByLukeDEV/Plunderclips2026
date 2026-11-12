import { Suspense } from "react";
import Link from "next/link";
import { CLIP_TAGS, listSections } from "@plunderclips/clips";
import {
  REJECT_REASONS,
  canFeature,
  listQueue,
  queueCounts,
  type QueueStatus,
} from "@plunderclips/moderation";
import { Button } from "@plunderclips/ui/components/button";
import { cn } from "@plunderclips/ui/lib/utils";
import { ReviewCard } from "@/components/admin/review-card";
import { playerSrc } from "@/lib/clips-data";
import { requireStaff } from "@/lib/staff";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TABS: { status: QueueStatus; label: string }[] = [
  { status: "pending", label: "Waiting" },
  { status: "approved", label: "Published" },
  { status: "rejected", label: "Rejected" },
];

export default function QueuePage({ searchParams }: Props) {
  return (
    <div>
      <h1 className="text-h2">Review queue</h1>
      <p className="text-muted-foreground mt-3 max-w-[60ch]">
        Oldest first. Publishing puts a clip on the site straight away; a rejection reason is shown
        to the submitter in their dashboard.
      </p>
      <Suspense fallback={<div className="bg-card mt-8 h-96 animate-pulse rounded-2xl" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Queue({ searchParams }: Props) {
  const { actor } = await requireStaff("/admin/queue");
  const sp = await searchParams;
  const status = TABS.find((t) => t.status === sp.status)?.status ?? "pending";
  const after = typeof sp.after === "string" ? sp.after : null;
  const [page, counts, sections] = await Promise.all([
    listQueue(actor, { status, cursor: after }),
    queueCounts(),
    listSections(),
  ]);

  return (
    <>
      <nav aria-label="Queue" className="mt-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={t.status === "pending" ? "/admin/queue" : `/admin/queue?status=${t.status}`}
            aria-current={t.status === status ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
              t.status === status
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-card",
            )}
          >
            {t.label}
            <span className="font-mono text-xs tabular-nums opacity-80">{counts[t.status]}</span>
          </Link>
        ))}
      </nav>

      {page.clips.length ? (
        <div className="mt-6 grid gap-6">
          {page.clips.map((c) => (
            <ReviewCard
              key={c.id}
              clip={{ ...c, createdAt: c.createdAt.toISOString() }}
              playerSrc={playerSrc(c)}
              tags={CLIP_TAGS}
              sections={sections.map((s) => ({ slug: s.slug, title: s.title }))}
              reasons={REJECT_REASONS}
              canFeature={canFeature(actor)}
            />
          ))}
        </div>
      ) : (
        <div className="border-border mt-6 rounded-2xl border border-dashed p-10 text-center">
          <p className="text-h3 font-medium">
            {status === "pending" ? "The queue is empty" : "Nothing here yet"}
          </p>
          <p className="text-muted-foreground mx-auto mt-3 max-w-[44ch]">
            {status === "pending"
              ? "Every submitted clip has been looked at. New ones show up here."
              : "Clips land here once they've been reviewed."}
          </p>
        </div>
      )}

      {page.nextCursor ? (
        <div className="mt-8">
          <Button asChild variant="secondary" size="lg">
            <Link
              href={`/admin/queue?${new URLSearchParams({ ...(status !== "pending" ? { status } : {}), after: page.nextCursor })}`}
            >
              More clips
            </Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}
