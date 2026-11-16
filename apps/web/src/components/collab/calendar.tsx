"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { Input } from "@plunderclips/ui/components/input";
import { Label } from "@plunderclips/ui/components/label";
import { cn } from "@plunderclips/ui/lib/utils";
import { sessionAction } from "@/app/crews/collab-actions";
import { useHydrated } from "@/components/local-time";

export type CalendarSession = {
  id: string;
  title: string;
  notes: string;
  startsAt: string;
  durationMin: number;
  isPublic: boolean;
  going: string[];
  maybe: string[];
  mine: "going" | "maybe" | null;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const longDay = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const monthName = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

/**
 * A month grid and an agenda, both in the viewer's own timezone (the server stores UTC).
 * Leads schedule sessions here; every member can say they're going.
 */
export function SessionCalendar({
  slug,
  crewId,
  sessions,
  canSchedule,
}: {
  slug: string;
  crewId: string;
  sessions: CalendarSession[];
  canSchedule: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [picked, setPicked] = useState<Date | null>(null);
  // Fixed for this render cycle; "coming up" refreshes with the page.
  const [now] = useState(() => Date.now());
  const selected = picked ? dayKey(picked) : null;

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarSession[]>();
    for (const s of sessions) {
      const k = dayKey(new Date(s.startsAt));
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [sessions]);

  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const startDay = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from(
      { length: 42 },
      (_, i) => new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + i),
    );
  }, [month]);

  const run = (op: Parameters<typeof sessionAction>[1], after?: () => void) =>
    start(async () => {
      setNote(null);
      const r = await sessionAction(slug, op);
      if (r) setNote(r);
      else {
        after?.();
        router.refresh();
      }
    });

  // Days and times are laid out in the viewer's timezone, which the server can't know: render
  // once the page is live.
  const hydrated = useHydrated();
  if (!hydrated) return <div aria-hidden className="bg-card h-96 animate-pulse rounded-2xl" />;

  const agenda = selected
    ? (byDay.get(selected) ?? [])
    : sessions.filter((s) => new Date(s.startsAt).getTime() + s.durationMin * 60_000 > now);
  const today = dayKey(new Date());

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div>
        <div className="flex items-center justify-between">
          <p className="font-medium" aria-live="polite">
            {monthName.format(month)}
          </p>
          <div className="flex">
            <button
              type="button"
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="hover:bg-accent grid size-11 place-items-center rounded-lg"
            >
              <ChevronLeft className="size-5" aria-hidden />
              <span className="sr-only">Previous month</span>
            </button>
            <button
              type="button"
              onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="hover:bg-accent grid size-11 place-items-center rounded-lg"
            >
              <ChevronRight className="size-5" aria-hidden />
              <span className="sr-only">Next month</span>
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="text-muted-foreground py-1 font-mono text-xs">
              {w}
            </span>
          ))}
          {cells.map((d) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const out = d.getMonth() !== month.getMonth();
            return (
              <button
                key={k}
                type="button"
                aria-pressed={selected === k}
                aria-label={`${longDay.format(d)}${list.length ? `, ${list.length} ${list.length === 1 ? "session" : "sessions"}` : ""}`}
                onClick={() => setPicked((p) => (p && dayKey(p) === k ? null : d))}
                className={cn(
                  "hover:bg-accent relative grid aspect-square min-h-11 place-items-center rounded-lg text-sm transition-colors",
                  out && "text-muted-foreground/60",
                  selected === k && "bg-accent",
                  k === today && "ring-headline ring-1",
                )}
              >
                {d.getDate()}
                {list.length ? (
                  <span
                    aria-hidden
                    className="bg-headline absolute bottom-1.5 size-1.5 rounded-full"
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {canSchedule ? <ScheduleForm crewId={crewId} pending={pending} onSubmit={run} /> : null}
      </div>

      <div>
        <h2 className="text-muted-foreground font-mono text-xs font-normal tracking-wider">
          {picked ? longDay.format(picked) : "Coming up"}
        </h2>
        {note ? (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {note}
          </p>
        ) : null}
        <ul className="mt-3 grid gap-3">
          {agenda.map((s) => {
            const at = new Date(s.startsAt);
            const end = new Date(at.getTime() + s.durationMin * 60_000);
            return (
              <li key={s.id} className="bg-card border-border rounded-xl border p-4">
                <p className="text-muted-foreground font-mono text-xs">
                  {longDay.format(at)} · {time.format(at)}–{time.format(end)}
                  {s.isPublic ? " · public" : ""}
                </p>
                <p className="mt-1 font-medium">{s.title}</p>
                {s.notes ? (
                  <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">
                    {s.notes}
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-2 text-sm">
                  {s.going.length
                    ? `Going: ${s.going.join(", ")}`
                    : "Nobody's said they're going yet."}
                  {s.maybe.length ? ` · Maybe: ${s.maybe.join(", ")}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant={s.mine === "going" ? "default" : "secondary"}
                    disabled={pending}
                    aria-pressed={s.mine === "going"}
                    onClick={() =>
                      run({
                        op: "rsvp",
                        sessionId: s.id,
                        status: s.mine === "going" ? null : "going",
                      })
                    }
                  >
                    Going
                  </Button>
                  <Button
                    variant={s.mine === "maybe" ? "default" : "ghost"}
                    disabled={pending}
                    aria-pressed={s.mine === "maybe"}
                    onClick={() =>
                      run({
                        op: "rsvp",
                        sessionId: s.id,
                        status: s.mine === "maybe" ? null : "maybe",
                      })
                    }
                  >
                    Maybe
                  </Button>
                  {canSchedule ? (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run({ op: "delete", sessionId: s.id })}
                    >
                      Cancel session
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
          {!agenda.length ? (
            <li className="border-border text-muted-foreground rounded-xl border border-dashed p-6 text-sm">
              {selected
                ? "Nothing on this day."
                : canSchedule
                  ? "Nothing planned. Schedule the next session."
                  : "Nothing planned yet."}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function ScheduleForm({
  crewId,
  pending,
  onSubmit,
}: {
  crewId: string;
  pending: boolean;
  onSubmit: (op: Parameters<typeof sessionAction>[1], after?: () => void) => void;
}) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState(120);
  const [isPublic, setPublic] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <form
      className="bg-card border-border mt-8 grid gap-4 rounded-2xl border p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        // datetime-local is the viewer's local time; send it as an absolute instant.
        const at = when ? new Date(when) : null;
        if (!title.trim() || !at || Number.isNaN(at.getTime()))
          return setError("Add a title and a start time.");
        onSubmit(
          {
            op: "create",
            crewId,
            title,
            notes,
            startsAt: at.toISOString(),
            durationMin: duration,
            isPublic,
          },
          () => {
            setTitle("");
            setWhen("");
            setNotes("");
            setPublic(false);
          },
        );
      }}
    >
      <p className="font-medium">Schedule a session</p>
      <div className="grid gap-2">
        <Label htmlFor="session-title">Title</Label>
        <Input
          id="session-title"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Hourglass night on stream"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="session-when">Starts</Label>
          <Input
            id="session-when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Your time ({zone}). Everyone sees it in theirs.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="session-length">Length</Label>
          <select
            id="session-length"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="border-input bg-background h-11 rounded-lg border px-3 text-sm"
          >
            {[60, 90, 120, 180, 240, 360].map((m) => (
              <option key={m} value={m}>
                {m < 120 ? `${m} minutes` : `${m / 60} hours`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="session-notes">
          Notes <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="session-notes"
          value={notes}
          maxLength={1000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ship, server, who streams"
          autoComplete="off"
        />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setPublic(e.target.checked)}
          className="accent-primary size-4"
        />
        Show on the crew page (public)
      </label>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Schedule
      </Button>
    </form>
  );
}
