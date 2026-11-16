import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getSession, rolesOf } from "@plunderclips/identity";
import { isStaff } from "@plunderclips/moderation";
import {
  LFC_DAYS,
  LFC_PLATFORMS,
  LFC_REGIONS,
  LFC_SHIPS,
  LFC_STYLES,
  type LfcFilter,
  type LfcPost,
} from "@plunderclips/social";
import { Button } from "@plunderclips/ui/components/button";
import { MessageButton } from "@/components/chat/message-button";
import { LfcClose } from "@/components/collab/lfc-close";
import { PLATFORM, REGION, SHIP, STYLE } from "@/components/collab/lfc-labels";
import { Avatar } from "@/components/creators/avatar";
import { LocalTime } from "@/components/local-time";
import { lfcList } from "@/lib/crews-data";

export const metadata: Metadata = {
  title: "Find a crew",
  description: "Sea of Thieves streamers looking for a crew, and crews looking for sailors.",
  alternates: { canonical: "/looking-for-crew" },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const select =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]";

export default function LfcPage(props: Props) {
  return (
    <section aria-labelledby="lfc-title" className="screen">
      <div className="wrap">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 id="lfc-title" className="text-h2">
              Find a crew
            </h1>
            <p className="text-lead text-muted-foreground mt-4 max-w-[56ch]">
              Streamers looking for a crew, and crews looking for sailors. Posts stay up for{" "}
              {LFC_DAYS} days, and anyone can message the person who posted.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/looking-for-crew/new">Post</Link>
          </Button>
        </div>
        <Suspense fallback={<div className="bg-card mt-10 h-64 animate-pulse rounded-2xl" />}>
          <List {...props} />
        </Suspense>
      </div>
    </section>
  );
}

async function List({ searchParams }: Props) {
  const sp = await searchParams;
  const filter: LfcFilter = {
    region: one(sp.region),
    platform: one(sp.platform),
    ship: one(sp.ship),
    style: one(sp.style),
  };
  const posts = await lfcList(filter);
  return (
    <>
      <form method="get" className="mt-10 flex flex-wrap items-end gap-3" aria-label="Filter posts">
        {(
          [
            ["region", "Region", LFC_REGIONS, REGION],
            ["platform", "Platform", LFC_PLATFORMS, PLATFORM],
            ["ship", "Ship", LFC_SHIPS, SHIP],
          ] as const
        ).map(([name, label, values, labels]) => (
          <label key={name} className="grid gap-1.5 text-sm">
            {label}
            <select name={name} defaultValue={filter[name] ?? "any"} className={select}>
              {values.map((v) => (
                <option key={v} value={v}>
                  {(labels as Record<string, string>)[v]}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="grid gap-1.5 text-sm">
          Playstyle
          <select name="style" defaultValue={filter.style ?? ""} className={select}>
            <option value="">Any playstyle</option>
            {LFC_STYLES.map((v) => (
              <option key={v} value={v}>
                {STYLE[v]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {posts.length ? (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </ul>
      ) : (
        <div className="border-border mt-8 rounded-2xl border border-dashed p-10 text-center">
          <p className="text-h3 font-medium">No posts match</p>
          <p className="text-muted-foreground mx-auto mt-3 max-w-[46ch]">
            Try a wider filter, or post your own and let crews find you.
          </p>
        </div>
      )}
    </>
  );
}

function PostCard({ post: p }: { post: LfcPost }) {
  const facts = [REGION[p.region], PLATFORM[p.platform], SHIP[p.ship]].filter(
    (f) => !f.startsWith("Any"),
  );
  return (
    <li className="bg-card border-border grid gap-4 rounded-2xl border p-5">
      <div className="flex items-center gap-3">
        <Avatar name={p.author.name} image={p.author.image} className="size-11 text-[44px]" />
        <div className="min-w-0">
          <p className="truncate font-medium">
            <Link href={`/c/${p.author.handle}`} className="link-draw">
              {p.author.name}
            </Link>
            {p.crew ? (
              <span className="text-muted-foreground">
                {" "}
                for{" "}
                <Link href={`/crews/${p.crew.slug}`} className="link-draw">
                  {p.crew.name}
                </Link>
              </span>
            ) : null}
          </p>
          <p className="text-muted-foreground font-mono text-xs">
            {p.crew ? "Crew recruiting" : "Looking for a crew"} ·{" "}
            <LocalTime value={p.createdAt} format="date" />
          </p>
        </div>
      </div>
      <div>
        <h2 className="text-foreground font-sans text-lg font-medium tracking-normal normal-case">
          {p.title}
        </h2>
        {p.body ? (
          <p className="text-muted-foreground mt-2 text-sm whitespace-pre-line">{p.body}</p>
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Details">
        {[
          ...facts,
          ...p.styles.map((s) => STYLE[s]),
          ...(p.availability ? [p.availability] : []),
        ].map((f) => (
          <li key={f} className="border-border rounded-full border px-3 py-1 text-xs">
            {f}
          </li>
        ))}
      </ul>
      <Suspense fallback={null}>
        <PostActions post={p} />
      </Suspense>
    </li>
  );
}

/** Per visitor: message the author, close your own post, or (staff) remove it. */
async function PostActions({ post }: { post: LfcPost }) {
  await connection();
  const session = await getSession(await headers());
  if (!session)
    return (
      <Button asChild variant="secondary" className="justify-self-start">
        <Link href="/sign-in?next=/looking-for-crew">Sign in to message</Link>
      </Button>
    );
  if (session.user.id === post.author.userId)
    return <LfcClose postId={post.id} label="Close post" />;
  const staff = isStaff({ id: session.user.id, roles: rolesOf(session) });
  return (
    <div className="flex flex-wrap items-start gap-2">
      <MessageButton userId={post.author.userId} handle={post.author.handle} />
      {staff ? <LfcClose postId={post.id} label="Remove post" /> : null}
    </div>
  );
}
