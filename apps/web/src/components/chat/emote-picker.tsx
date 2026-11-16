"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Smile } from "lucide-react";
import type { Emote, EmoteSets } from "@plunderclips/social";
import { cn } from "@plunderclips/ui/lib/utils";
import { EMOJI } from "./emoji-data";

type Tab = "emoji" | "channel" | "7tv" | "bttv";

/** Emoji plus the channel's 7TV and BTTV emotes, with search. Picking inserts into the draft. */
export function EmotePicker({ sets, onPick }: { sets: EmoteSets; onPick: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("emoji");
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const tabs = (
    [
      ["emoji", "Emoji", 1],
      ["channel", "Channel", sets.channel.length],
      ["7tv", "7TV", sets.global.filter((e) => e.provider === "7tv").length],
      ["bttv", "BTTV", sets.global.filter((e) => e.provider === "bttv").length],
    ] as const
  ).filter(([, , n]) => n > 0);

  const needle = q.trim().toLowerCase();
  const emotes: Emote[] = useMemo(() => {
    const list =
      tab === "channel"
        ? sets.channel
        : tab === "emoji"
          ? []
          : sets.global.filter((e) => e.provider === tab);
    return needle ? list.filter((e) => e.code.toLowerCase().includes(needle)) : list;
  }, [tab, sets, needle]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground hover:text-foreground hover:bg-accent grid size-11 place-items-center rounded-lg transition-colors"
      >
        <Smile className="size-5" aria-hidden />
        <span className="sr-only">Emoji and emotes</span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Emoji and emotes"
          className="bg-popover border-border absolute right-0 bottom-14 z-20 grid w-[min(360px,calc(100vw-32px))] gap-3 rounded-xl border p-3 shadow-xl"
        >
          <div role="tablist" className="flex gap-1">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "min-h-11 rounded-lg px-3 text-sm font-medium transition-colors",
                  tab === id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "emoji" ? "Search emoji" : "Search emotes"}
            aria-label="Search"
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]"
          />
          <div data-lenis-prevent className="max-h-64 overflow-y-auto overscroll-contain">
            {tab === "emoji" ? (
              EMOJI.map((group) => {
                const list = needle ? group.list.filter(([, n]) => n.includes(needle)) : group.list;
                return list.length ? (
                  <div key={group.name} className="mb-3">
                    <p className="text-muted-foreground mb-1 font-mono text-xs uppercase">
                      {group.name}
                    </p>
                    <div className="grid grid-cols-8 gap-0.5">
                      {list.map(([char, name]) => (
                        <button
                          key={char}
                          type="button"
                          title={name.split(" ")[0]}
                          onClick={() => onPick(char)}
                          className="hover:bg-accent grid aspect-square place-items-center rounded-md text-xl"
                        >
                          <span aria-hidden>{char}</span>
                          <span className="sr-only">{name.split(" ")[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null;
              })
            ) : emotes.length ? (
              <div className="grid grid-cols-6 gap-1">
                {emotes.map((e) => (
                  <button
                    key={`${e.provider}:${e.code}`}
                    type="button"
                    title={e.code}
                    onClick={() => onPick(e.code)}
                    className="hover:bg-accent grid aspect-square place-items-center rounded-md p-1"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- emote CDNs */}
                    <img
                      src={e.url}
                      alt={e.code}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="max-h-8 max-w-full"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground py-6 text-center text-sm">Nothing matches.</p>
            )}
          </div>
          {tab === "channel" ? (
            <p className="text-muted-foreground text-xs">
              From the 7TV and BTTV sets of members who linked Twitch.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
