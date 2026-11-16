import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { weekStart } from "@plunderclips/clips";
import { Button } from "@plunderclips/ui/components/button";
import { ClipGrid } from "@/components/clips/clip-card";
import { GridSkeleton } from "@/components/clips/grid-skeleton";
import { sectionPage } from "@/lib/clips-data";

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  const page = await sectionPage(section);
  if (!page) return { title: "Section not found" };
  return {
    title: page.section.title,
    description: page.section.blurb,
    alternates: { canonical: `/clips/${page.section.slug}` },
  };
}

export default function SectionPage({ params }: Props) {
  return (
    <section className="screen">
      <div className="wrap">
        <Suspense fallback={<Fallback />}>
          <Content params={params} />
        </Suspense>
      </div>
    </section>
  );
}

async function Content({ params }: Props) {
  const { section } = await params;
  const page = await sectionPage(section);
  if (!page) notFound();
  const { section: s, clips, period, fallback } = page;

  return (
    <>
      <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
        {s.kind === "weekly" && period ? weekLabel(period) : "Curated by the mods"}
      </p>
      <h1 className="text-h2 mt-3">{s.title}</h1>
      <p className="text-lead text-muted-foreground mt-4 max-w-[52ch]">{s.blurb}</p>
      {fallback && clips.length ? (
        <p className="border-border bg-card mt-8 max-w-[60ch] rounded-xl border p-4 text-sm">
          This week&apos;s picks aren&apos;t in yet. Until then, here are the newest clips from the
          last seven days.
        </p>
      ) : null}
      {/* Keeps the heading outline h1 → h2 → h3 (card titles are h3). */}
      <h2 className="sr-only">Clips</h2>
      <div className="mt-10">
        {clips.length ? (
          <ClipGrid clips={clips} />
        ) : (
          <div className="border-border rounded-2xl border border-dashed p-10 text-center">
            <p className="text-h3 font-medium">Nothing here yet</p>
            <p className="text-muted-foreground mx-auto mt-3 max-w-[44ch]">
              The mods haven&apos;t picked any clips for this section. Browse everything in the
              meantime.
            </p>
            <Button asChild variant="secondary" size="lg" className="mt-6">
              <Link href="/clips">All clips</Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

/** "2026-W46" → "Week of 9 Nov 2026" */
function weekLabel(period: string): string {
  const start = weekStart(period);
  if (!start) return period;
  return `Week of ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
}

function Fallback() {
  return (
    <div aria-hidden>
      <div className="bg-card h-3 w-32 animate-pulse rounded" />
      <div className="bg-card mt-4 h-12 w-64 animate-pulse rounded-lg" />
      <div className="bg-card mt-5 h-5 w-96 max-w-full animate-pulse rounded" />
      <GridSkeleton />
    </div>
  );
}
