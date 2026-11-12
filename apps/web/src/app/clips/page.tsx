import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CLIP_TAGS, isClipTag } from "@plunderclips/clips";
import { Button } from "@plunderclips/ui/components/button";
import { cn } from "@plunderclips/ui/lib/utils";
import { ClipGrid } from "@/components/clips/clip-card";
import { GridSkeleton } from "@/components/clips/grid-skeleton";
import { clipsPage } from "@/lib/clips-data";

export const metadata: Metadata = {
  title: "All clips",
  description: "Every approved Sea of Thieves clip on Plunderclips, newest first.",
  alternates: { canonical: "/clips" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default function ClipsPage({ searchParams }: Props) {
  return (
    <section aria-labelledby="clips-title" className="screen">
      <div className="wrap">
        <h1 id="clips-title" className="text-h2">
          All clips
        </h1>
        <p className="text-lead text-muted-foreground mt-4 max-w-[52ch]">
          Every clip the mods let through, newest first.
        </p>
        <Suspense fallback={<GridSkeleton withFilters />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </div>
    </section>
  );
}

async function Results({ searchParams }: Props) {
  const params = await searchParams;
  const tagParam = one(params.tag);
  const tag = isClipTag(tagParam) ? tagParam : null;
  const cursor = one(params.after);
  const page = await clipsPage(cursor, tag);

  const href = (t: string | null) => (t ? `/clips?tag=${t}` : "/clips");
  const next = page.nextCursor
    ? `/clips?${new URLSearchParams({ ...(tag ? { tag } : {}), after: page.nextCursor })}`
    : null;

  return (
    <>
      <nav
        aria-label="Filter by tag"
        className="-mx-1 mt-10 flex [scrollbar-width:none] gap-2 overflow-x-auto px-1 py-1 sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {[null, ...Object.keys(CLIP_TAGS)].map((t) => {
          const active = t === tag;
          return (
            <Link
              key={t ?? "all"}
              href={href(t)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-card",
              )}
            >
              {t ? CLIP_TAGS[t as keyof typeof CLIP_TAGS] : "All"}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8">
        {page.clips.length ? (
          <ClipGrid clips={page.clips} />
        ) : (
          <Empty tag={tag ? CLIP_TAGS[tag] : null} first={!cursor} />
        )}
      </div>

      {next || cursor ? (
        <div className="mt-14 flex gap-3">
          {cursor ? (
            <Button asChild variant="secondary" size="lg">
              <Link href={href(tag)}>Back to newest</Link>
            </Button>
          ) : null}
          {next ? (
            <Button asChild variant="secondary" size="lg">
              <Link href={next}>Older clips</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Empty({ tag, first }: { tag: string | null; first: boolean }) {
  return (
    <div className="border-border rounded-2xl border border-dashed p-10 text-center">
      <p className="text-h3 font-medium">
        {!first ? "That's the end of the list" : tag ? `No ${tag} clips yet` : "No clips yet"}
      </p>
      <p className="text-muted-foreground mx-auto mt-3 max-w-[44ch]">
        Seen a good one on stream? Send it in and it shows up here once a mod has checked it.
      </p>
      <Button asChild size="lg" className="mt-6">
        <Link href="/submit">Submit a clip</Link>
      </Button>
    </div>
  );
}
