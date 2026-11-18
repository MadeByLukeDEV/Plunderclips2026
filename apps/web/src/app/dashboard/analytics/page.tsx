import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { clipAnalytics } from "@plunderclips/clips";
import { authorUrls, followerGrowth, getProfileByUser } from "@plunderclips/creators";
import { Button } from "@plunderclips/ui/components/button";
import { BarChart } from "@/components/analytics/bar-chart";
import { LocalTime } from "@/components/local-time";
import { requireSession } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Analytics" };

const DAYS = 30;

export default function AnalyticsPage() {
  return (
    <div>
      <h1 className="text-h2">Analytics</h1>
      <p className="text-muted-foreground mt-3 max-w-[60ch]">
        How the clips from your channels are doing on Plunderclips, and who&apos;s following you.
        Counts update every hour; days are in UTC.
      </p>
      <div className="mt-10">
        <Suspense fallback={<div className="bg-card h-96 animate-pulse rounded-2xl" />}>
          <Numbers />
        </Suspense>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border-border rounded-xl border p-5">
      <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{label}</p>
      <p className="font-display mt-2 text-4xl tabular-nums">{value.toLocaleString("en-GB")}</p>
    </div>
  );
}

async function Numbers() {
  const session = await requireSession("/dashboard/analytics");
  const profile = await getProfileByUser(session.user.id);
  if (!profile)
    return (
      <div className="border-border max-w-2xl rounded-2xl border border-dashed p-8">
        <p className="text-h3 font-medium">Make your creator page first</p>
        <p className="text-muted-foreground mt-3 max-w-[50ch]">
          Analytics follow the channels on your page: clips people send in from them show up here.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/dashboard/profile">Make your page</Link>
        </Button>
      </div>
    );

  const [stats, follows] = await Promise.all([
    clipAnalytics(
      profile.channels.map((c) => ({ ...c, authorUrls: authorUrls(c) })),
      DAYS,
    ),
    followerGrowth(profile.userId, DAYS),
  ]);
  const newFollows = follows.reduce((n, d) => n + d.follows, 0);

  return (
    <div className="grid gap-12">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clips" value={stats.totals.clips} />
        <Stat label="Views" value={stats.totals.views} />
        <Stat label="Votes" value={stats.totals.votes} />
        <Stat label="Followers" value={profile.followerCount} />
      </div>

      <section aria-labelledby="views-title">
        <h2
          id="views-title"
          className="text-h3 text-foreground font-sans font-medium tracking-normal normal-case"
        >
          Views, last {DAYS} days
        </h2>
        <div className="mt-4">
          <BarChart
            data={stats.daily.map((d) => ({ day: d.day, value: d.views }))}
            unit="views"
            label="Views per day"
          />
        </div>
      </section>

      <section aria-labelledby="follows-title">
        <h2
          id="follows-title"
          className="text-h3 text-foreground font-sans font-medium tracking-normal normal-case"
        >
          New followers, last {DAYS} days{" "}
          <span className="text-muted-foreground font-mono text-sm">
            ({newFollows.toLocaleString("en-GB")})
          </span>
        </h2>
        <div className="mt-4">
          {newFollows ? (
            <BarChart
              data={follows.map((d) => ({ day: d.day, value: d.follows }))}

              unit="followers"

              label="New followers per day"
            />
          ) : (
            <p className="text-muted-foreground">
              No new followers in the last {DAYS} days. People follow you from your creator page.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="top-title">
          <h2
            id="top-title"
            className="text-h3 text-foreground font-sans font-medium tracking-normal normal-case"
          >
            Top clips
          </h2>
          {stats.top.length ? (
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="text-muted-foreground font-mono text-xs">
                  <th className="py-2 font-normal">Clip</th>
                  <th className="py-2 text-right font-normal">Views</th>
                  <th className="py-2 text-right font-normal">Votes</th>
                </tr>
              </thead>
              <tbody>
                {stats.top.map((c) => (
                  <tr key={c.id} className="border-border border-t">
                    <td className="py-3 pr-4">
                      <Link href={`/clip/${c.id}`} className="link-draw font-medium">
                        {c.title}
                      </Link>
                      {c.approvedAt ? (
                        <span className="text-muted-foreground block font-mono text-xs">
                          <LocalTime value={c.approvedAt} format="date" />
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums">
                      {c.views.toLocaleString("en-GB")}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums">
                      {c.votes.toLocaleString("en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground mt-4">
              {profile.channels.length
                ? "No clips from your channels yet. Once people send some in and a mod approves them, they show up here."
                : "Add your channels to your page; clips from them show up here."}
            </p>
          )}
        </section>
        <section aria-labelledby="sections-title">
          <h2
            id="sections-title"
            className="text-h3 text-foreground font-sans font-medium tracking-normal normal-case"
          >
            Picked for
          </h2>
          {stats.sections.length ? (
            <ul className="mt-4 grid gap-2">
              {stats.sections.map((s) => (
                <li
                  key={s.slug}
                  className="bg-card border-border flex justify-between rounded-lg border px-4 py-3"
                >
                  <Link href={`/clips/${s.slug}`} className="link-draw">
                    {s.title}
                  </Link>
                  <span className="font-mono tabular-nums">
                    {s.picks}
                    <span className="sr-only"> {s.picks === 1 ? "pick" : "picks"}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-4">
              No section picks yet. This week fills itself from votes every hour.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
