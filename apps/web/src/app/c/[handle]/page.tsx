import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { channelUrl, followerCount, isFollowing, type Profile } from "@plunderclips/creators";
import { getSession } from "@plunderclips/identity";
import { REPORT_REASONS } from "@plunderclips/moderation";
import { ReportButton } from "@/components/report-button";
import { Button } from "@plunderclips/ui/components/button";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { ClipGrid } from "@/components/clips/clip-card";
import { platformMeta } from "@/components/clips/clip-meta";
import { GridSkeleton } from "@/components/clips/grid-skeleton";
import { Avatar } from "@/components/creators/avatar";
import { FollowButton } from "@/components/creators/follow-button";
import { bannerArt } from "@/lib/art";
import { creatorPage } from "@/lib/creators-data";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const data = await creatorPage(handle, null);
  if (!data) return { title: "Creator not found", robots: { index: false } };
  const { profile } = data;
  const description =
    profile.bio.slice(0, 160) ||
    `Sea of Thieves clips from ${profile.displayName} on Plunderclips.`;
  return {
    title: `${profile.displayName} (@${profile.handle})`,
    description,
    alternates: { canonical: `/c/${profile.handle}` },
    openGraph: { type: "profile", title: profile.displayName, description },
  };
}

export default function CreatorPage(props: Props) {
  return (
    <Suspense fallback={<Fallback />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: Props) {
  const { handle } = await params;
  const sp = await searchParams;
  const after = typeof sp.after === "string" ? sp.after : null;
  const data = await creatorPage(handle, after);
  if (!data) notFound();
  const { profile, clips } = data;
  const art = bannerArt[profile.banner];

  return (
    <>
      <section
        aria-labelledby="creator-name"
        className="pt-[calc(var(--header-h)+16px)] pb-12 md:pb-16"
      >
        <div className="wrap">
          <div className="relative aspect-[3/1] overflow-hidden rounded-2xl md:aspect-[4/1]">
            <Image
              src={art.src}
              alt={art.alt}
              fill
              preload
              placeholder="blur"
              sizes="(min-width: 1360px) 1280px, 100vw"
              className="object-cover"
            />
          </div>
          <div className="grid-12">
            <div className="col-span-12 flex items-start gap-4 pl-4 md:col-span-8 md:gap-6 md:pl-6">
              <Avatar
                name={profile.displayName}
                image={profile.image}
                className="ring-background relative -mt-10 size-20 text-[80px] ring-4 md:-mt-14 md:size-28 md:text-[112px]"
              />
              <div className="min-w-0 pt-3 md:pt-4">
                <h1 id="creator-name" className="text-h2 truncate">
                  {profile.displayName}
                </h1>
                <p className="text-muted-foreground font-mono text-sm">@{profile.handle}</p>
              </div>
            </div>
          </div>

          <div className="grid-12 mt-8">
            <div className="col-span-12 min-w-0 md:col-span-7">
              {profile.bio ? (
                <p className="text-lead max-w-[60ch] whitespace-pre-line">{profile.bio}</p>
              ) : null}
              {profile.channels.length ? (
                <ul className="mt-6 flex flex-wrap gap-2" aria-label="Channels">
                  {profile.channels.map((c) => {
                    const meta = platformMeta[c.platform];
                    return (
                      <li key={c.platform}>
                        <a
                          href={channelUrl(c)}
                          target="_blank"
                          rel="noopener noreferrer me"
                          className="border-border hover:bg-card inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors"
                        >
                          {meta.icon ? (
                            <PlatformIcon platform={meta.icon} className="size-4" />
                          ) : null}
                          <span>
                            <span className="sr-only">{meta.label}: </span>
                            {c.handle}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <div className="col-span-12 md:col-span-4 md:col-start-9 md:justify-self-end">
              <Suspense fallback={<div className="bg-card h-12 w-48 animate-pulse rounded-lg" />}>
                <Follow profile={profile} />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="creator-clips" className="pb-24">
        <div className="wrap">
          <h2 id="creator-clips" className="text-h3 font-medium">
            Clips from {profile.displayName}
          </h2>
          <div className="mt-8">
            {clips.clips.length ? (
              <ClipGrid clips={clips.clips} />
            ) : (
              <div className="border-border rounded-2xl border border-dashed p-10 text-center">
                <p className="text-h3 font-medium">No clips yet</p>
                <p className="text-muted-foreground mx-auto mt-3 max-w-[46ch]">
                  {profile.channels.length
                    ? "Clips from these channels show up here once a mod approves them."
                    : "Once channels are added to this profile, approved clips from them show up here."}
                </p>
                <Button asChild variant="secondary" size="lg" className="mt-6">
                  <Link href="/submit">Submit a clip</Link>
                </Button>
              </div>
            )}
          </div>
          {clips.nextCursor ? (
            <div className="mt-12">
              <Button asChild variant="secondary" size="lg">
                <Link href={`/c/${profile.handle}?after=${clips.nextCursor}`}>Older clips</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}

/** Per visitor, so outside the cache: follow state, live count, and "Edit profile" for the owner. */
async function Follow({ profile }: { profile: Profile }) {
  await connection();
  const session = await getSession(await headers());
  const me = session?.user.id ?? null;
  if (me === profile.userId) {
    return (
      <Button asChild variant="secondary" size="lg">
        <Link href="/dashboard/profile">Edit profile</Link>
      </Button>
    );
  }
  const [following, followers] = await Promise.all([
    isFollowing(me, profile.userId),
    followerCount(profile.userId),
  ]);
  return (
    <div className="grid gap-3 md:justify-items-end">
      <FollowButton
        creatorId={profile.userId}
        handle={profile.handle}
        initial={{ following, followers }}
        signedIn={!!me}
      />
      <ReportButton targetType="creator" targetId={profile.userId} reasons={REPORT_REASONS} />
    </div>
  );
}

function Fallback() {
  return (
    <section aria-hidden className="pt-[calc(var(--header-h)+16px)]">
      <div className="wrap">
        <div className="bg-card aspect-[3/1] animate-pulse rounded-2xl md:aspect-[4/1]" />
        <div className="bg-card mt-6 h-10 w-64 animate-pulse rounded-lg" />
        <GridSkeleton />
      </div>
    </section>
  );
}
