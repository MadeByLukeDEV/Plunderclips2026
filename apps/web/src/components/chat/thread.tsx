"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Send, Trash2 } from "lucide-react";
import type { ChatEvent, ChatMessageWire, EmoteSets } from "@plunderclips/social";
import { Button } from "@plunderclips/ui/components/button";
import { cn } from "@plunderclips/ui/lib/utils";
import { deleteAction, markReadAction, sendAction } from "@/app/chat/actions";
import { olderMessagesAction } from "@/app/chat/history-action";
import { Avatar } from "@/components/creators/avatar";
import { ReportButton } from "@/components/report-button";
import { EmotePicker } from "./emote-picker";
import { EmoteText } from "./emote-text";

const MAX = 2000;
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

function merge(list: ChatMessageWire[], incoming: ChatMessageWire[]): ChatMessageWire[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/**
 * One conversation, live. The server renders the latest page; this keeps it current over
 * server-sent events, catches up after reconnects (Last-Event-ID), and moves the read marker while
 * the tab is visible.
 */
export function Thread({
  channelId,
  meId,
  initial,
  hasOlder: initialHasOlder,
  reasons,
  emotes,
}: {
  channelId: string;
  meId: string;
  initial: ChatMessageWire[];
  hasOlder: boolean;
  reasons: Record<string, string>;
  emotes: EmoteSets;
}) {
  const [messages, setMessages] = useState(initial);
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<"live" | "connecting" | "gone">("connecting");
  const [sending, startSend] = useTransition();
  const [loadingOlder, startOlder] = useTransition();
  const list = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const lastRead = useRef(0);
  const draftBox = useRef<HTMLTextAreaElement>(null);
  const emoteMap = useMemo(
    () => new Map([...emotes.global, ...emotes.channel].map((e) => [e.code, e])),
    [emotes],
  );

  /** Puts an emoji or emote code at the cursor; codes get spaces so they stay separate words. */
  function insert(text: string) {
    const el = draftBox.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    const isCode = /^[\p{L}\p{N}_:]/u.test(text) && !/\p{Extended_Pictographic}/u.test(text);
    const piece = isCode
      ? `${before && !/\s$/.test(before) ? " " : ""}${text}${after.startsWith(" ") ? "" : " "}`
      : text;
    const next = (before + piece + after).slice(0, MAX);
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = Math.min(before.length + piece.length, next.length);
      el?.setSelectionRange(pos, pos);
    });
  }

  const lastId = messages.at(-1)?.id ?? 0;

  // Live stream. EventSource reconnects by itself and sends Last-Event-ID.
  useEffect(() => {
    const after = initial.at(-1)?.id ?? 0;
    const es = new EventSource(`/api/chat/${channelId}/stream?after=${after}`);
    es.onopen = () => setStatus("live");
    es.onerror = () => setStatus((s) => (s === "gone" ? s : "connecting"));
    es.addEventListener("message", (ev) => {
      const e = JSON.parse((ev as MessageEvent).data) as ChatEvent;
      if (e.type === "message") setMessages((l) => merge(l, [e.message]));
    });
    es.addEventListener("delete", (ev) => {
      const e = JSON.parse((ev as MessageEvent).data) as ChatEvent;
      if (e.type === "delete")
        setMessages((l) =>
          l.map((m) => (m.id === e.id ? { ...m, body: "", deleted: m.deleted ?? "author" } : m)),
        );
    });
    es.addEventListener("gone", () => {
      setStatus("gone");
      es.close();
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one stream per channel
  }, [channelId]);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible" || !lastId || lastId <= lastRead.current) return;
    lastRead.current = lastId;
    void markReadAction(channelId, lastId);
  }, [channelId, lastId]);

  useEffect(() => {
    const t = setTimeout(markRead, 600);
    document.addEventListener("visibilitychange", markRead);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", markRead);
    };
  }, [markRead]);

  function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setNote(null);
    startSend(async () => {
      const r = await sendAction(channelId, body);
      if (r.ok) {
        setDraft("");
        stick.current = true;
        setMessages((l) => merge(l, [r.message]));
      } else setNote(r.error);
    });
  }

  function older() {
    const first = messages[0]?.id;
    if (!first) return;
    startOlder(async () => {
      const r = await olderMessagesAction(channelId, first);
      if (!r) return;
      const el = list.current;
      const before = el ? el.scrollHeight - el.scrollTop : 0;
      stick.current = false;
      setMessages((l) => merge(l, r.messages));
      setHasOlder(r.hasOlder);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    });
  }

  async function remove(id: number) {
    const r = await deleteAction(id);
    if (r) setNote(r);
    else
      setMessages((l) => l.map((m) => (m.id === id ? { ...m, body: "", deleted: "author" } : m)));
  }

  const days = messages.map((m) => day.format(new Date(m.createdAt)));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ol
        ref={list}
        aria-label="Messages"
        aria-live="polite"
        aria-relevant="additions"
        data-lenis-prevent
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-4"
      >
        {hasOlder ? (
          <li className="mb-4 flex justify-center">
            <Button variant="ghost" onClick={older} disabled={loadingOlder}>
              {loadingOlder ? <Loader2 className="size-4 animate-spin" /> : null}
              Older messages
            </Button>
          </li>
        ) : null}
        {!messages.length ? (
          <li className="text-muted-foreground py-16 text-center text-sm">
            No messages yet. Say ahoy.
          </li>
        ) : null}
        {messages.map((m, i) => {
          const at = new Date(m.createdAt);
          const d = days[i]!;
          const showDay = i === 0 || d !== days[i - 1];
          const prev = messages[i - 1];
          const grouped =
            !showDay &&
            prev?.authorId === m.authorId &&
            at.getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          const mine = m.authorId === meId;
          return (
            <li key={m.id}>
              {showDay ? (
                <p className="text-muted-foreground my-4 text-center font-mono text-xs">{d}</p>
              ) : null}
              <div
                className={cn(
                  "group hover:bg-card relative flex gap-3 rounded-lg py-1 pr-12 pl-2",
                  !grouped && "mt-3",
                )}
              >
                <div className="w-9 shrink-0">
                  {grouped ? null : (
                    <Link href={`/c/${m.handle}`} tabIndex={-1} aria-hidden>
                      <Avatar name={m.displayName} image={m.image} className="size-9 text-[36px]" />
                    </Link>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {grouped ? null : (
                    <p className="flex items-baseline gap-2">
                      <Link href={`/c/${m.handle}`} className="link-draw text-sm font-medium">
                        {m.displayName}
                      </Link>
                      <time
                        dateTime={m.createdAt}
                        className="text-muted-foreground font-mono text-xs"
                      >
                        {time.format(at)}
                      </time>
                    </p>
                  )}
                  {m.deleted ? (
                    <p className="text-muted-foreground text-sm italic">
                      {m.deleted === "staff" ? "Removed by a moderator" : "Message deleted"}
                    </p>
                  ) : (
                    <p className="text-[15px] break-words whitespace-pre-line">
                      <EmoteText body={m.body} emotes={emoteMap} />
                    </p>
                  )}
                </div>
                {m.deleted ? null : (
                  <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-100 has-[form]:static has-[form]:translate-y-0 has-[form]:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                    {mine ? (
                      <button
                        type="button"
                        onClick={() => remove(m.id)}
                        className="text-muted-foreground hover:text-foreground grid size-11 place-items-center"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        <span className="sr-only">Delete your message</span>
                      </button>
                    ) : (
                      <ReportButton
                        targetType="message"
                        targetId={String(m.id)}
                        reasons={reasons}
                        compact
                      />
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <form
        className="border-border border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {status === "gone" ? (
          <p role="status" className="text-muted-foreground text-sm">
            You&apos;re not in this conversation any more.
          </p>
        ) : (
          <>
            <label htmlFor="chat-draft" className="sr-only">
              Message
            </label>
            <div className="flex items-end gap-2">
              <textarea
                ref={draftBox}
                id="chat-draft"
                value={draft}
                rows={1}
                maxLength={MAX}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Write a message"
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 max-h-40 min-h-11 flex-1 resize-none rounded-lg border bg-transparent px-3 py-2.5 text-base outline-none focus-visible:ring-[3px] md:text-sm"
              />
              <EmotePicker sets={emotes} onPick={insert} />
              <Button type="submit" size="icon" disabled={sending || !draft.trim()}>
                {sending ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Send className="size-5" />
                )}
                <span className="sr-only">Send</span>
              </Button>
            </div>
            <p className="text-muted-foreground mt-2 flex justify-between text-xs">
              <span>Enter sends, Shift+Enter adds a line.</span>
              <span aria-live="polite">{status === "connecting" ? "Reconnecting…" : ""}</span>
            </p>
          </>
        )}
        {note ? (
          <p role="alert" className="text-destructive mt-2 text-sm">
            {note}
          </p>
        ) : null}
      </form>
    </div>
  );
}
