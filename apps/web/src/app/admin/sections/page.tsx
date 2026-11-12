import { Suspense } from "react";
import Link from "next/link";
import { isoWeek, listSections, previousWeek, weekStart } from "@plunderclips/clips";
import { canFeature, listSectionPicks } from "@plunderclips/moderation";
import { cn } from "@plunderclips/ui/lib/utils";
import { SectionPicks } from "@/components/admin/section-picks";
import { requireStaff } from "@/lib/staff";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function SectionsPage({ searchParams }: Props) {
  return (
    <div>
      <h1 className="text-h2">Sections</h1>
      <p className="text-muted-foreground mt-3 max-w-[60ch]">
        Order the picks for each section. Add clips to a section from the review queue.
      </p>
      <Suspense fallback={<div className="bg-card mt-8 h-72 animate-pulse rounded-2xl" />}>
        <Sections searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const weekLabel = (key: string) => {
  const d = weekStart(key);
  return d
    ? `Week of ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`
    : key;
};

async function Sections({ searchParams }: Props) {
  const { actor } = await requireStaff("/admin/sections");
  if (!canFeature(actor))
    return <p className="text-muted-foreground mt-8">Your role can&apos;t curate sections.</p>;
  const sp = await searchParams;
  const sections = await listSections();
  const current = sections.find((s) => s.slug === sp.s) ?? sections[0];
  if (!current) return <p className="text-muted-foreground mt-8">No sections exist.</p>;

  const thisWeek = isoWeek(new Date());
  const weeks = [thisWeek, previousWeek(thisWeek)!, previousWeek(previousWeek(thisWeek)!)!];
  const period =
    current.kind === "weekly"
      ? typeof sp.w === "string" && weeks.includes(sp.w)
        ? sp.w
        : thisWeek
      : "";
  const picks = await listSectionPicks(actor, current.slug, period);

  return (
    <>
      <nav aria-label="Section" className="mt-8 flex flex-wrap gap-2">
        {sections.map((s) => (
          <Link
            key={s.slug}
            href={`/admin/sections?s=${s.slug}`}
            aria-current={s.slug === current.slug ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors",
              s.slug === current.slug
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-card",
            )}
          >
            {s.title}
          </Link>
        ))}
      </nav>
      {current.kind === "weekly" ? (
        <nav aria-label="Week" className="mt-4 flex flex-wrap gap-1">
          {weeks.map((w) => (
            <Link
              key={w}
              href={`/admin/sections?s=${current.slug}&w=${w}`}
              aria-current={w === period ? "true" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-lg px-4 text-sm transition-colors",
                w === period
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w === thisWeek ? "This week" : weekLabel(w)}
            </Link>
          ))}
        </nav>
      ) : null}
      <SectionPicks
        key={`${current.slug}:${period}`}
        slug={current.slug}
        period={period}
        picks={picks}
      />
    </>
  );
}
