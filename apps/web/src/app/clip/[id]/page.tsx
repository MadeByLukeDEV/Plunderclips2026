import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { CLIP_TAGS } from "@plunderclips/clips";
import { Button } from "@plunderclips/ui/components/button";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { ClipGrid } from "@/components/clips/clip-card";
import { formatDate, formatDuration, platformMeta } from "@/components/clips/clip-meta";
import { ClipPlayer } from "@/components/clips/clip-player";
import { ClipStats, ClipStatsSkeleton } from "@/components/clips/clip-stats";
import { clipPage, playerSrc } from "@/lib/clips-data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await clipPage(id);
  if (!data) return { title: "Clip not found", robots: { index: false } };
  const { clip } = data;
  const by = clip.authorName ? ` by ${clip.authorName}` : "";
  const description = `Sea of Thieves clip${by} on ${platformMeta[clip.platform].label}.`;
  return {
    title: clip.title,
    description,
    alternates: { canonical: `/clip/${clip.id}` },
    openGraph: {
      type: "video.other",
      title: clip.title,
      description,
      images: clip.thumbnailUrl ? [{ url: clip.thumbnailUrl }] : undefined,
    },
  };
}

export default function ClipPage({ params }: Props) {
  return (
    <Suspense fallback={<Fallback />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Props) {
  const { id } = await params;
  const data = await clipPage(id);
  if (!data) notFound();
  const { clip, related, sections } = data;
  const meta = platformMeta[clip.platform];
  const duration = formatDuration(clip.durationSeconds);
  const date = formatDate(clip.approvedAt);

  return (
    <>
      <section
        aria-labelledby="clip-title"
        className="pt-[calc(var(--header-h)+32px)] pb-16 md:pt-[calc(var(--header-h)+48px)] md:pb-20"
      >
        <div className="wrap grid-12 content-start">
          <div className="col-span-12 min-w-0 lg:col-span-8">
            <ClipPlayer clip={clip} src={playerSrc(clip)} clipId={clip.id} />
          </div>
          <div className="col-span-12 min-w-0 lg:col-span-4">
            {sections.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Picked for">
                {sections.map((s) => (
                  <li key={s.slug}>
                    <Link
                      href={`/clips/${s.slug}`}
                      className="border-primary text-primary inline-flex min-h-8 items-center rounded-full border px-3 font-mono text-xs tracking-wider uppercase"
                    >
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <h1 id="clip-title" className="text-h3 mt-4 font-medium text-balance">
              {clip.title}
            </h1>
            <div className="mt-6">
              <Suspense fallback={<ClipStatsSkeleton />}>
                <ClipStats clipId={clip.id} />
              </Suspense>
            </div>
            <dl className="text-muted-foreground mt-6 grid gap-3 text-sm">
              <div className="flex items-center gap-2">
                <dt className="sr-only">Streamer</dt>
                <dd className="text-foreground flex items-center gap-2 font-medium">
                  {meta.icon ? <PlatformIcon platform={meta.icon} className="size-5" /> : null}
                  {clip.authorUrl ? (
                    <a
                      href={clip.authorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-draw"
                    >
                      {clip.authorName ?? meta.label}
                    </a>
                  ) : (
                    (clip.authorName ?? meta.label)
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tracking-wide">
                {duration ? (
                  <div>
                    <dt className="sr-only">Length</dt>
                    <dd>{duration}</dd>
                  </div>
                ) : null}
                {date ? (
                  <div>
                    <dt className="sr-only">Added</dt>
                    <dd>Added {date}</dd>
                  </div>
                ) : null}
              </div>
            </dl>
            {clip.tags.length ? (
              <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tags">
                {clip.tags.map((t) => (
                  <li key={t}>
                    <Link
                      href={`/clips?tag=${t}`}
                      className="border-border hover:bg-card inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors"
                    >
                      {CLIP_TAGS[t]}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button asChild variant="secondary" size="lg" className="mt-8">
              <a href={clip.canonicalUrl} target="_blank" rel="noopener noreferrer">
                Open on {meta.label} <ExternalLink className="size-4" aria-hidden />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {related.length ? (
        <section aria-labelledby="related-title" className="pb-24">
          <div className="wrap">
            <h2 id="related-title" className="text-h3 font-medium">
              More clips
            </h2>
            <div className="mt-8">
              <ClipGrid clips={related} eagerCount={0} />
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Fallback() {
  return (
    <section
      className="pt-[calc(var(--header-h)+32px)] pb-16 md:pt-[calc(var(--header-h)+48px)]"
      aria-hidden
    >
      <div className="wrap grid-12 content-start">
        <div className="bg-card col-span-12 aspect-video animate-pulse rounded-2xl lg:col-span-8" />
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-card h-8 w-4/5 animate-pulse rounded-lg" />
          <div className="bg-card mt-6 h-4 w-1/2 animate-pulse rounded" />
        </div>
      </div>
    </section>
  );
}
