"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@plunderclips/ui/lib/utils";
import { latestNotificationsAction, markReadAction } from "@/app/notifications/actions";
import type { NotificationView } from "./describe";

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/** Header bell: live unread count over SSE, the latest few on click. Signed-in members only. */
export function NotificationBell({
  stacked = false,
  onNavigate,
}: {
  stacked?: boolean;
  onNavigate?: () => void;
}) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    es.addEventListener("count", (ev) => {
      const { unread: n } = JSON.parse((ev as MessageEvent).data) as { unread: number };
      setUnread(n);
      setItems(null); // refetch next time the panel opens
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!items) void latestNotificationsAction().then((l) => setItems(l ?? []));
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, items]);

  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  const badge = unread ? (
    <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 min-w-5 rounded-full px-1 text-center font-mono text-[11px] leading-5">
      {unread > 99 ? "99+" : unread}
    </span>
  ) : null;

  if (stacked)
    return (
      <Link
        href="/notifications"
        onClick={onNavigate}
        className="border-border bg-secondary relative flex h-12 items-center gap-2 rounded-lg border px-6"
      >
        <Bell className="size-5" aria-hidden />
        Notifications{unread ? ` (${unread})` : ""}
      </Link>
    );

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-accent relative grid size-11 place-items-center rounded-lg transition-colors"
      >
        <Bell className="size-5" aria-hidden />
        {badge}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="bg-popover border-border absolute top-13 right-0 z-50 w-[min(380px,calc(100vw-32px))] rounded-xl border shadow-xl"
        >
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <p className="font-medium">Notifications</p>
            {unread ? (
              <button
                type="button"
                onClick={() => {
                  void markReadAction();
                  setItems((l) => l?.map((i) => ({ ...i, read: true })) ?? l);
                }}
                className="link-draw text-muted-foreground min-h-11 text-sm"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <ul data-lenis-prevent className="max-h-96 overflow-y-auto overscroll-contain">
            {items === null ? (
              <li className="text-muted-foreground p-6 text-center text-sm">Loading…</li>
            ) : items.length ? (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read) void markReadAction([n.id]);
                      setOpen(false);
                      onNavigate?.();
                      router.push(n.href);
                    }}
                    className={cn(
                      "hover:bg-accent flex w-full gap-3 px-4 py-3 text-left transition-colors",
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
                      <span className="block text-sm">{n.text}</span>
                      {n.detail ? (
                        <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-sm">
                          {n.detail}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono text-xs">
                      {ago(n.createdAt)}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground p-6 text-center text-sm">
                Nothing yet. Approved clips, new followers, crew requests and mentions show up here.
              </li>
            )}
          </ul>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="border-border hover:bg-accent block border-t px-4 py-3 text-center text-sm font-medium"
          >
            See all
          </Link>
        </div>
      ) : null}
    </div>
  );
}
