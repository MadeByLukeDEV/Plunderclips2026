import { Suspense } from "react";
import Link from "next/link";
import { listMyClips, myClipStats } from "@plunderclips/clips";
import { getProfileByUser, listFollowing } from "@plunderclips/creators";
import { rolesOf } from "@plunderclips/identity";
import { Button } from "@plunderclips/ui/components/button";
import { ClipThumb } from "@/components/clips/clip-thumb";
import { Avatar } from "@/components/creators/avatar";
import { ClipStatusBadge } from "@/components/dashboard/clip-status";
import { requireSession } from "@/lib/auth-guard";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="bg-card h-96 animate-pulse rounded-2xl" />}>
      <Overview />
    </Suspense>
  );
}

const roleNote: Record<string, string> = {
  creator: "Trusted creator: your clips skip the review queue.",
  mod: "Mod",
  admin: "Admin",
};

async function Overview() {
  const session = await requireSession("/dashboard");
  const userId = session.user.id;
  const [stats, recent, profile, following] = await Promise.all([
    myClipStats(userId),
    listMyClips(userId),
    getProfileByUser(userId),
    listFollowing(userId, 8),
  ]);
  const notes = rolesOf(session).flatMap((r) => (roleNote[r] ? [roleNote[r]] : []));
  const tiles = [
    { label: "Live", value: stats.approved, href: "/dashboard/clips?status=approved" },
    { label: "Waiting", value: stats.pending, href: "/dashboard/clips?status=pending" },
    { label: "Votes on your clips", value: stats.votes },
    { label: "Views on your clips", value: stats.views },
  ];

  return (
    <div>
      <h1 className="text-h2">Ahoy, {session.user.name}</h1>
      <p className="text-muted-foreground mt-3">
        Signed in as {session.user.email}
        {notes.length ? ` · ${notes.join(" · ")}` : null}
      </p>

      <dl className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => {
          const body = (
            <>
              <dt className="text-muted-foreground text-sm">{t.label}</dt>
              <dd className="mt-2 font-mono text-3xl tabular-nums">
                {t.value.toLocaleString("en-GB")}
              </dd>
            </>
          );
          return t.href ? (
            <Link
              key={t.label}
              href={t.href}
              className="lift border-border bg-card rounded-2xl border p-5"
            >
              <div>{body}</div>
            </Link>
          ) : (
            <div key={t.label} className="border-border bg-card rounded-2xl border p-5">
              {body}
            </div>
          );
        })}
      </dl>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="recent-title"
          className="border-border bg-card rounded-2xl border p-6"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-title" className="text-h3 font-medium">
              Recent clips
            </h2>
            {recent.clips.length ? (
              <Link href="/dashboard/clips" className="link-draw text-muted-foreground text-sm">
                All your clips
              </Link>
            ) : null}
          </div>
          {recent.clips.length ? (
            <ul className="mt-5 grid gap-4">
              {recent.clips.slice(0, 4).map((c) => (
                <li key={c.id} className="flex items-center gap-4">
                  <ClipThumb clip={c} className="w-24 shrink-0 rounded-md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <div className="mt-1.5">
                      <ClipStatusBadge status={c.status} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-3">
              Clips you send in while signed in show up here with their review status.
            </p>
          )}
          <Button asChild className="mt-6">
            <Link href="/submit">Submit a clip</Link>
          </Button>
        </section>

        <section
          aria-labelledby="page-title"
          className="border-border bg-card rounded-2xl border p-6"
        >
          <h2 id="page-title" className="text-h3 font-medium">
            Your page
          </h2>
          {profile ? (
            <>
              <p className="text-muted-foreground mt-2">
                plunderclips/c/{profile.handle} · {profile.followerCount}{" "}
                {profile.followerCount === 1 ? "follower" : "followers"} · {profile.channels.length}{" "}
                {profile.channels.length === 1 ? "channel" : "channels"}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild variant="secondary">
                  <Link href={`/c/${profile.handle}`}>View your page</Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/dashboard/profile">Edit</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground mt-2">
                A public page with your channels and the clips people sent in from them.
              </p>
              <Button asChild variant="secondary" className="mt-6">
                <Link href="/dashboard/profile">Make your page</Link>
              </Button>
            </>
          )}
          <p className="text-muted-foreground mt-6 text-sm">
            Sign in with more platforms from{" "}
            <Link href="/dashboard/accounts" className="link-draw text-foreground">
              Linked accounts
            </Link>
            .
          </p>
        </section>
      </div>

      <section aria-labelledby="following-title" className="mt-10">
        <h2 id="following-title" className="text-h3 font-medium">
          Following
        </h2>
        {following.length ? (
          <ul className="mt-5 flex flex-wrap gap-3">
            {following.map((p) => (
              <li key={p.userId}>
                <Link
                  href={`/c/${p.handle}`}
                  className="border-border hover:bg-card flex min-h-11 items-center gap-3 rounded-full border py-1.5 pr-4 pl-1.5 transition-colors"
                >
                  <Avatar name={p.displayName} image={p.image} className="size-8 text-[32px]" />
                  <span className="text-sm font-medium">{p.displayName}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-3">
            Follow streamers from their page.{" "}
            <Link href="/creators" className="link-draw text-foreground">
              Browse creators
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
