import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listMyCrews, pendingRequestCount, type Crew, type CrewRole } from "@plunderclips/social";
import { Button } from "@plunderclips/ui/components/button";
import { bannerArt } from "@/lib/art";
import { requireSession } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Your crews" };

export default function DashboardCrewsPage() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-h2">Your crews</h1>
          <p className="text-muted-foreground mt-3 max-w-[56ch]">
            The crews you sail with and the ones you’ve asked to join.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/crews/new">Found a crew</Link>
        </Button>
      </div>
      <div className="mt-10">
        <Suspense fallback={<div className="bg-card h-64 animate-pulse rounded-2xl" />}>
          <Crews />
        </Suspense>
      </div>
    </div>
  );
}

const ROLE: Record<CrewRole, string> = {
  captain: "Captain",
  officer: "Officer",
  deckhand: "Deckhand",
};

async function Crews() {
  const session = await requireSession("/dashboard/crews");
  const [{ crews, requested }, waiting] = await Promise.all([
    listMyCrews(session.user.id),
    pendingRequestCount(session.user.id),
  ]);

  if (!crews.length && !requested.length)
    return (
      <div className="border-border rounded-2xl border border-dashed p-10 text-center">
        <p className="text-h3 font-medium">No crew yet</p>
        <p className="text-muted-foreground mx-auto mt-3 max-w-[46ch]">
          Find streamers you already sail with, or found a crew and invite your regulars.
        </p>
        <Button asChild variant="secondary" size="lg" className="mt-6">
          <Link href="/crews">Browse crews</Link>
        </Button>
      </div>
    );

  return (
    <div className="grid gap-12">
      {waiting ? (
        <p role="status" className="bg-card border-border rounded-xl border p-4 text-sm">
          {waiting} {waiting === 1 ? "person is" : "people are"} waiting to join your crews. Answer
          them on each crew’s page.
        </p>
      ) : null}
      {crews.length ? (
        <CrewList
          title="Sailing with"
          crews={crews.map((c) => ({ crew: c, note: ROLE[c.role] }))}
        />
      ) : null}
      {requested.length ? (
        <CrewList
          title="Asked to join"
          crews={requested.map((c) => ({ crew: c, note: "Waiting for an answer" }))}
        />
      ) : null}
    </div>
  );
}

function CrewList({ title, crews }: { title: string; crews: { crew: Crew; note: string }[] }) {
  return (
    <section>
      <h2 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{title}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {crews.map(({ crew, note }) => (
          <li key={crew.id}>
            <Link
              href={`/crews/${crew.slug}`}
              className="lift border-border bg-card flex items-center gap-4 overflow-hidden rounded-xl border pr-4"
            >
              <span className="relative block aspect-square w-20 shrink-0">
                <Image
                  src={bannerArt[crew.banner].src}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </span>
              <span className="min-w-0 py-3">
                <span className="block truncate font-medium">{crew.name}</span>
                <span className="text-muted-foreground block font-mono text-xs">
                  {note} · {crew.memberCount} {crew.memberCount === 1 ? "member" : "members"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
