import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { listMyClips, myClipStats, type ClipStatus } from "@plunderclips/clips";
import { Button } from "@plunderclips/ui/components/button";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { cn } from "@plunderclips/ui/lib/utils";
import { formatDate, platformMeta } from "@/components/clips/clip-meta";
import { ClipThumb } from "@/components/clips/clip-thumb";
import { ClipStatusBadge } from "@/components/dashboard/clip-status";
import { WithdrawButton } from "@/components/dashboard/withdraw-button";
import { requireSession } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Your clips" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTERS: { status: ClipStatus | null; label: string }[] = [
  { status: null, label: "All" },
  { status: "pending", label: "Waiting" },
  { status: "approved", label: "Live" },
  { status: "rejected", label: "Not approved" },
];

export default function MyClipsPage({ searchParams }: Props) {
  return (
    <div>
      <h1 className="text-h2">Your clips</h1>
      <p className="text-muted-foreground mt-3 max-w-[56ch]">
        Everything you sent in while signed in, and where it stands with the mods.
      </p>
      <Suspense fallback={<ListSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: Props) {
  const session = await requireSession("/dashboard/clips");
  const sp = await searchParams;
  const raw = typeof sp.status === "string" ? sp.status : null;
  const status = FILTERS.find((f) => f.status === raw)?.status ?? null;
  const after = typeof sp.after === "string" ? sp.after : null;
  const [page, stats] = await Promise.all([
    listMyClips(session.user.id, { status, cursor: after }),
    myClipStats(session.user.id),
  ]);
  const total = stats.pending + stats.approved + stats.rejected;
  const countOf = (s: ClipStatus | null) => (s ? stats[s] : total);
  const href = (s: ClipStatus | null) => (s ? `/dashboard/clips?status=${s}` : "/dashboard/clips");

  return (
    <>
      <nav aria-label="Filter by status" className="mt-8 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.status === status;
          return (
            <Link
              key={f.label}
              href={href(f.status)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-card",
              )}
            >
              {f.label}
              <span className="font-mono text-xs tabular-nums opacity-80">{countOf(f.status)}</span>
            </Link>
          );
        })}
      </nav>

      {page.clips.length ? (
        <ul className="divide-border border-border bg-card mt-6 divide-y rounded-2xl border">
          {page.clips.map((c) => {
            const meta = platformMeta[c.platform];
            return (
              <li key={c.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
                <ClipThumb clip={c} className="w-full shrink-0 rounded-lg sm:w-40" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <ClipStatusBadge status={c.status} />
                    <span className="text-muted-foreground font-mono text-xs">
                      Sent {formatDate(c.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 font-medium">{c.title}</p>
                  <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
                    {meta.icon ? <PlatformIcon platform={meta.icon} className="size-4" /> : null}
                    {meta.label}
                    {c.status === "approved" ? (
                      <span className="font-mono text-xs tabular-nums">
                        · {c.voteCount} {c.voteCount === 1 ? "vote" : "votes"} · {c.viewCount}{" "}
                        {c.viewCount === 1 ? "view" : "views"}
                      </span>
                    ) : null}
                  </p>
                  {c.status === "rejected" && c.rejectReason ? (
                    <p className="border-destructive/40 mt-3 border-l-2 pl-3 text-sm">
                      <span className="text-muted-foreground">Mod note: </span>
                      {c.rejectReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                  {c.status === "approved" ? (
                    <Button asChild variant="secondary">
                      <Link href={`/clip/${c.id}`}>View</Link>
                    </Button>
                  ) : (
                    <Button asChild variant="ghost">
                      <a href={c.canonicalUrl} target="_blank" rel="noopener noreferrer">
                        Open <ExternalLink className="size-4" aria-hidden />
                      </a>
                    </Button>
                  )}
                  {c.status === "pending" ? <WithdrawButton clipId={c.id} title={c.title} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="border-border mt-6 rounded-2xl border border-dashed p-10 text-center">
          <p className="text-h3 font-medium">
            {status
              ? `Nothing ${FILTERS.find((f) => f.status === status)!.label.toLowerCase()}`
              : "No clips yet"}
          </p>
          <p className="text-muted-foreground mx-auto mt-3 max-w-[46ch]">
            {status
              ? "Clips move between these tabs as the mods review them."
              : "Clips you send in while signed in show up here, so you can follow them through review."}
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/submit">Submit a clip</Link>
          </Button>
        </div>
      )}

      {page.nextCursor ? (
        <div className="mt-8">
          <Button asChild variant="secondary" size="lg">
            <Link
              href={`/dashboard/clips?${new URLSearchParams({ ...(status ? { status } : {}), after: page.nextCursor })}`}
            >
              Older clips
            </Link>
          </Button>
        </div>
      ) : null}
    </>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="mt-8">
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-card h-11 w-24 animate-pulse rounded-full" />
        ))}
      </div>
      <div className="bg-card mt-6 h-72 animate-pulse rounded-2xl" />
    </div>
  );
}
