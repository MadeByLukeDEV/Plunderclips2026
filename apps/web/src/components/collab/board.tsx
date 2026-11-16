"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Trash2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { Input } from "@plunderclips/ui/components/input";
import { Label } from "@plunderclips/ui/components/label";
import { boardAction } from "@/app/crews/collab-actions";

export type BoardCard = {
  id: string;
  title: string;
  notes: string;
  status: "idea" | "planned" | "done";
  authorName: string | null;
  canEdit: boolean;
};

const COLUMNS = [
  ["idea", "Ideas"],
  ["planned", "Planned"],
  ["done", "Done"],
] as const;

/** A crew's board: three columns, cards move with buttons (no dragging needed). */
export function Board({ crewId, items }: { crewId: string; items: BoardCard[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const run = (op: Parameters<typeof boardAction>[0], after?: () => void) =>
    start(async () => {
      setNote(null);
      const r = await boardAction(op);
      if (r) setNote(r);
      else {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="grid gap-8">
      <form
        className="bg-card border-border grid gap-3 rounded-2xl border p-5 md:grid-cols-[1fr_1.4fr_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return setNote("Give the idea a title.");
          run({ op: "add", crewId, title, notes }, () => {
            setTitle("");
            setNotes("");
          });
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="board-new-title">New idea</Label>
          <Input
            id="board-new-title"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kraken speedrun on stream"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="board-notes">
            Notes <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="board-notes"
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Who, when, what you need"
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Add
        </Button>
      </form>
      {note ? (
        <p role="alert" className="text-destructive -mt-4 text-sm">
          {note}
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        {COLUMNS.map(([status, label], col) => {
          const cards = items.filter((i) => i.status === status);
          return (
            <section key={status} aria-labelledby={`col-${status}`} className="min-w-0">
              <h2
                id={`col-${status}`}
                className="text-muted-foreground font-mono text-xs font-normal tracking-wider"
              >
                {label} ({cards.length})
              </h2>
              <ul className="mt-3 grid gap-3">
                {cards.map((c) => (
                  <li key={c.id} className="bg-card border-border rounded-xl border p-4">
                    <p className="font-medium break-words">{c.title}</p>
                    {c.notes ? (
                      <p className="text-muted-foreground mt-1 text-sm break-words whitespace-pre-line">
                        {c.notes}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-muted-foreground truncate font-mono text-xs">
                        {c.authorName ?? "Former member"}
                      </span>
                      {c.canEdit ? (
                        <span className="flex shrink-0">
                          {col > 0 ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run({ op: "move", itemId: c.id, status: COLUMNS[col - 1]![0] })
                              }
                              className="hover:bg-accent text-muted-foreground hover:text-foreground grid size-11 place-items-center rounded-lg"
                            >
                              <ArrowLeft className="size-4" aria-hidden />
                              <span className="sr-only">
                                Move {c.title} to {COLUMNS[col - 1]![1]}
                              </span>
                            </button>
                          ) : null}
                          {col < COLUMNS.length - 1 ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run({ op: "move", itemId: c.id, status: COLUMNS[col + 1]![0] })
                              }
                              className="hover:bg-accent text-muted-foreground hover:text-foreground grid size-11 place-items-center rounded-lg"
                            >
                              <ArrowRight className="size-4" aria-hidden />
                              <span className="sr-only">
                                Move {c.title} to {COLUMNS[col + 1]![1]}
                              </span>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run({ op: "delete", itemId: c.id })}
                            className="hover:bg-accent text-muted-foreground hover:text-foreground grid size-11 place-items-center rounded-lg"
                          >
                            <Trash2 className="size-4" aria-hidden />
                            <span className="sr-only">Delete {c.title}</span>
                          </button>
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
                {!cards.length ? (
                  <li className="border-border text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                    {status === "idea"
                      ? "No ideas yet. Add the first one above."
                      : "Nothing here yet."}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
