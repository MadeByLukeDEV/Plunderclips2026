import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { listNotifications } from "@plunderclips/notifications";
import { Button } from "@plunderclips/ui/components/button";
import { cn } from "@plunderclips/ui/lib/utils";
import { MarkAllRead } from "@/components/notifications/mark-all-read";
import { toView } from "@/components/notifications/describe";
import { requireSession } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default function NotificationsPage(props: Props) {
  return (
    <section aria-labelledby="notifications-title" className="screen">
      <div className="wrap max-w-3xl">
        <h1 id="notifications-title" className="text-h2">
          Notifications
        </h1>
        <Suspense fallback={<div className="bg-card mt-10 h-64 animate-pulse rounded-2xl" />}>
          <List {...props} />
        </Suspense>
      </div>
    </section>
  );
}

async function List({ searchParams }: Props) {
  const session = await requireSession("/notifications");
  const sp = await searchParams;
  const before = Number(typeof sp.before === "string" ? sp.before : 0) || undefined;
  const { items, hasMore } = await listNotifications(session.user.id, { before, limit: 30 });
  const views = items.map(toView);

  if (!views.length && !before)
    return (
      <p className="text-muted-foreground mt-6 max-w-[56ch]">
        Nothing yet. You&apos;ll hear here when a clip you sent in goes live, someone follows you,
        someone asks to join your crew, or a crewmate mentions you with @your-handle.
      </p>
    );

  return (
    <>
      <div className="mt-6 flex justify-end">
        {views.some((v) => !v.read) ? <MarkAllRead /> : null}
      </div>
      <ul className="divide-border mt-4 divide-y">
        {views.map((n) => (
          <li key={n.id}>
            <Link
              href={n.href}
              className={cn(
                "hover:bg-card flex gap-4 rounded-lg px-3 py-4 transition-colors",
                !n.read && "bg-card",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-2 size-2 shrink-0 rounded-full",
                  n.read ? "bg-transparent" : "bg-headline",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block">
                  {n.text}
                  {n.read ? null : <span className="sr-only"> (unread)</span>}
                </span>
                {n.detail ? (
                  <span className="text-muted-foreground mt-1 block text-sm">{n.detail}</span>
                ) : null}
              </span>
              <time
                dateTime={n.createdAt}
                className="text-muted-foreground shrink-0 font-mono text-xs"
              >
                {when.format(new Date(n.createdAt))}
              </time>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <Button asChild variant="secondary" size="lg" className="mt-8">
          <Link href={`/notifications?before=${items.at(-1)!.id}`}>Older</Link>
        </Button>
      ) : null}
    </>
  );
}
