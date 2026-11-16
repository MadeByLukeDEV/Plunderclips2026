import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCrewBySlug, listSessions, standing } from "@plunderclips/social";
import { CrewTabs } from "@/components/collab/crew-tabs";
import { SessionCalendar } from "@/components/collab/calendar";
import { requireSession } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Crew calendar", robots: { index: false } };

type Props = { params: Promise<{ slug: string }> };

/** Six weeks back to six months ahead: what the month grid can page through. */
function sessionWindow() {
  const now = Date.now();
  return { from: new Date(now - 45 * 86_400_000), to: new Date(now + 180 * 86_400_000) };
}

export default function CalendarPage(props: Props) {
  return (
    <section aria-labelledby="calendar-title" className="pt-[calc(var(--header-h)+32px)] pb-24">
      <div className="wrap">
        <Suspense fallback={<div className="bg-card h-96 animate-pulse rounded-2xl" />}>
          <Content {...props} />
        </Suspense>
      </div>
    </section>
  );
}

async function Content({ params }: Props) {
  const { slug } = await params;
  const session = await requireSession(`/crews/${slug}/calendar`);
  const me = session.user.id;
  const crew = await getCrewBySlug(slug);
  if (!crew) notFound();
  const s = await standing(crew.id, me);
  if (s.kind !== "member") notFound();
  const sessions = await listSessions(crew.id, me, sessionWindow());
  return (
    <>
      <CrewTabs slug={crew.slug} current="calendar" />
      <h1 id="calendar-title" className="text-h2 mt-6">
        {crew.name}: calendar
      </h1>
      <p className="text-muted-foreground mt-3 max-w-[60ch]">
        Sessions, streams and collabs. Times show in your own timezone.
        {s.role === "deckhand"
          ? " The captain and officers schedule them; say if you're going."
          : ""}
      </p>
      <div className="mt-8">
        <SessionCalendar
          slug={crew.slug}
          crewId={crew.id}
          canSchedule={s.role !== "deckhand"}
          sessions={sessions.map((x) => ({
            id: x.id,
            title: x.title,
            notes: x.notes,
            startsAt: x.startsAt.toISOString(),
            durationMin: x.durationMin,
            isPublic: x.isPublic,
            going: x.going.map((g) => g.name),
            maybe: x.maybe.map((g) => g.name),
            mine: x.going.some((g) => g.userId === me)
              ? "going"
              : x.maybe.some((g) => g.userId === me)
                ? "maybe"
                : null,
          }))}
        />
      </div>
    </>
  );
}
