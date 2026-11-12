import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ProfileSort } from "@plunderclips/creators";
import { Button } from "@plunderclips/ui/components/button";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { cn } from "@plunderclips/ui/lib/utils";
import { platformMeta } from "@/components/clips/clip-meta";
import { Avatar } from "@/components/creators/avatar";
import { bannerArt } from "@/lib/art";
import { creatorsList } from "@/lib/creators-data";

export const metadata: Metadata = {
  title: "Creators",
  description: "Sea of Thieves streamers on Plunderclips: their channels and their best clips.",
  alternates: { canonical: "/creators" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function CreatorsPage({ searchParams }: Props) {
  return (
    <section aria-labelledby="creators-title" className="screen">
      <div className="wrap">
        <h1 id="creators-title" className="text-h2">
          Creators
        </h1>
        <p className="text-lead text-muted-foreground mt-4 max-w-[52ch]">
          Streamers who sail Sea of Thieves, with their channels and their clips in one place.
        </p>
        <Suspense fallback={<ListSkeleton />}>
          <List searchParams={searchParams} />
        </Suspense>
      </div>
    </section>
  );
}

async function List({ searchParams }: Props) {
  const sp = await searchParams;
  const sort: ProfileSort = sp.sort === "followers" ? "followers" : "new";
  const profiles = await creatorsList(sort);

  return (
    <>
      <div className="mt-10 flex items-center gap-1" role="group" aria-label="Sort">
        {(
          [
            ["new", "Newest", "/creators"],
            ["followers", "Most followed", "/creators?sort=followers"],
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

      {profiles.length ? (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <li key={p.userId} className="group relative">
              <div className="lift border-border bg-card overflow-hidden rounded-2xl border">
                <div className="zoom-frame relative aspect-[3/1]">
                  <Image
                    src={bannerArt[p.banner].src}
                    alt=""
                    fill
                    placeholder="blur"
                    sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="flex items-center gap-4 p-5">
                  <Avatar name={p.displayName} image={p.image} className="size-12 text-[48px]" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium">
                      <Link
                        href={`/c/${p.handle}`}
                        className="after:absolute after:inset-0 focus-visible:outline-none"
                      >
                        {p.displayName}
                      </Link>
                    </h2>
                    <p className="text-muted-foreground font-mono text-xs">
                      @{p.handle} · {p.followerCount}{" "}
                      {p.followerCount === 1 ? "follower" : "followers"}
                    </p>
                  </div>
                  <ul className="flex gap-1.5" aria-label="Channels">
                    {p.channels.slice(0, 4).map((c) => {
                      const meta = platformMeta[c.platform];
                      return meta.icon ? (
                        <li key={c.platform}>
                          <PlatformIcon
                            platform={meta.icon}
                            className="size-4"
                            title={meta.label}
                          />
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-border mt-8 rounded-2xl border border-dashed p-10 text-center">
          <p className="text-h3 font-medium">No creator pages yet</p>
          <p className="text-muted-foreground mx-auto mt-3 max-w-[46ch]">
            Stream Sea of Thieves? Sign in with your platform and set up your page in a minute.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/dashboard/profile">Make your page</Link>
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
