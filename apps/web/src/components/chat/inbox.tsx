import Link from "next/link";
import type { InboxItem } from "@plunderclips/social";
import { cn } from "@plunderclips/ui/lib/utils";
import { Avatar } from "@/components/creators/avatar";

const when = (d: Date | null) => {
  if (!d) return "";
  const today = new Date().toDateString() === d.toDateString();
  return new Intl.DateTimeFormat(
    "en-GB",
    today ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" },
  ).format(d);
};

/** Crew channels and conversations, newest activity first, with unread counts. */
export function Inbox({ items, current }: { items: InboxItem[]; current?: string }) {
  if (!items.length)
    return (
      <div className="border-border rounded-2xl border border-dashed p-8">
        <p className="font-medium">Nothing here yet</p>
        <p className="text-muted-foreground mt-2 text-sm">
          Join a crew to get its channel, or message a creator from their page. You can message
          crewmates and creators who follow you.
        </p>
        <Link href="/crews" className="link-draw mt-4 inline-block text-sm font-medium">
          Browse crews
        </Link>
      </div>
    );

  const crews = items.filter((i) => i.kind === "crew");
  const dms = items.filter((i) => i.kind === "dm");
  return (
    <nav aria-label="Conversations" className="grid gap-8">
      {[
        ["Crew channels", crews],
        ["Direct messages", dms],
      ].map(([title, list]) =>
        (list as InboxItem[]).length ? (
          <div key={title as string}>
            <h2 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
              {title as string}
            </h2>
            <ul className="mt-3 grid gap-1">
              {(list as InboxItem[]).map((i) => (
                <li key={i.channelId}>
                  <Link
                    href={`/chat/${i.channelId}`}
                    aria-current={i.channelId === current ? "page" : undefined}
                    className={cn(
                      "hover:bg-card flex min-h-14 items-center gap-3 rounded-xl px-3 transition-colors",
                      i.channelId === current && "bg-card",
                    )}
                  >
                    {i.kind === "dm" ? (
                      <Avatar name={i.title} image={i.image} className="size-9 text-[36px]" />
                    ) : (
                      <span
                        aria-hidden
                        className="bg-secondary text-headline font-display grid size-9 shrink-0 place-items-center rounded-lg text-lg"
                      >
                        {i.title.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn("block truncate", i.unread ? "font-semibold" : "font-medium")}
                      >
                        {i.title}
                      </span>
                      <span className="text-muted-foreground block font-mono text-xs">
                        {i.kind === "crew" ? `/crews/${i.ref}` : `@${i.ref}`}
                      </span>
                    </span>
                    <span className="grid justify-items-end gap-1">
                      <span className="text-muted-foreground font-mono text-xs">
                        {when(i.lastMessageAt)}
                      </span>
                      {i.unread ? (
                        <span className="bg-primary text-primary-foreground min-w-5 rounded-full px-1.5 text-center font-mono text-xs leading-5">
                          {i.unread > 99 ? "99+" : i.unread}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </nav>
  );
}
