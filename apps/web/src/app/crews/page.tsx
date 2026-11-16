import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CrewSort } from "@plunderclips/social";
import { Button } from "@plunderclips/ui/components/button";
import { cn } from "@plunderclips/ui/lib/utils";
import { bannerImage } from "@/lib/art";
import { crewsList } from "@/lib/crews-data";

export const metadata: Metadata = {
  title: "Crews",
  description: "Sea of Thieves streamer crews on Plunderclips: who sails together and how to join.",
  alternates: { canonical: "/crews" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function CrewsPage({ searchParams }: Props) {
  return (
    <section aria-labelledby="crews-title" className="screen">
      <div className="wrap">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 id="crews-title" className="text-h2">
              Crews
            </h1>
            <p className="text-lead text-muted-foreground mt-4 max-w-[52ch]">
              Streamers who sail together. Find a crew to join, or found your own and bring your
              regulars aboard.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/crews/new">Found a crew</Link>
          </Button>
        </div>
        <Suspense fallback={<ListSkeleton />}>
          <List searchParams={searchParams} />
        </Suspense>
      </div>
    </section>
  );
}

async function List({ searchParams }: Props) {
  const sp = await searchParams;
  const sort: CrewSort = sp.sort === "members" ? "members" : "new";
  const crews = await crewsList(sort);

  return (
    <>
      <div className="mt-10 flex items-center gap-1" role="group" aria-label="Sort">
        {(
          [
            ["new", "Newest", "/crews"],
            ["members", "Biggest", "/crews?sort=members"],
          ] as const
        ).map(([s, label, href]) => (
          <Link
            key={s}
            href={href}
            aria-current={s === sort ? "true" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-lg px-4 text-sm font-medium transition-colors",
              s === sort
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {crews.length ? (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {crews.map((c) => (
            <li key={c.id} className="group relative">
              <div className="lift border-border bg-card overflow-hidden rounded-2xl border">
                <div className="zoom-frame relative aspect-[3/1]">
                  <Image
                    {...bannerImage(c, "")}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-5">
                  <h2 className="flex items-center gap-3 text-lg font-medium">
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploaded crew logo
                      <img
                        src={c.logoUrl}
                        alt=""
                        className="size-9 shrink-0 rounded-lg object-cover"
                      />
                    ) : null}
                    <Link
                      href={`/crews/${c.slug}`}
                      className="truncate after:absolute after:inset-0 focus-visible:outline-none"
                    >
                      {c.name}
                    </Link>
                  </h2>
                  {c.motto ? (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{c.motto}</p>
                  ) : null}
                  <p className="text-muted-foreground mt-3 font-mono text-xs">
                    {c.memberCount} {c.memberCount === 1 ? "member" : "members"} ·{" "}
                    {c.joinPolicy === "open" ? "open to join" : "join by request"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-border mt-8 rounded-2xl border border-dashed p-10 text-center">
          <p className="text-h3 font-medium">No crews yet</p>
          <p className="text-muted-foreground mx-auto mt-3 max-w-[46ch]">
            Sail with the same streamers every week? Found a crew and give it a page.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/crews/new">Found a crew</Link>
          </Button>
        </div>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="bg-card h-48 animate-pulse rounded-2xl" />
      ))}
    </div>
  );
}
