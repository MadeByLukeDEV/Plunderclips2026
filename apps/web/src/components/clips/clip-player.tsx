"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import type { ClipView } from "@plunderclips/clips";
import { platformMeta } from "./clip-meta";
import { ClipThumb } from "./clip-thumb";

/**
 * Facade: the thumbnail and a play button until the visitor asks for the video. Only then the
 * platform's iframe (and its trackers and megabytes of script) loads. No src: link-out instead.
 */
/** Counts a view: fire-and-forget, survives the tab navigating away to the platform. */
function sendView(clipId: string) {
  const url = `/api/clips/${clipId}/view`;
  if (!navigator.sendBeacon?.(url))
    void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
}

export function ClipPlayer({
  clip,
  src,
  clipId,
}: {
  clipId: string;
  clip: Pick<ClipView, "title" | "thumbnailUrl" | "platform" | "canonicalUrl" | "kind">;
  src: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const label = platformMeta[clip.platform].label;
  const vertical = clip.kind === "short" || clip.platform === "tiktok";

  const frame = vertical ? "mx-auto aspect-[9/16] max-h-[78svh] w-auto" : "aspect-video w-full";

  if (playing && src) {
    return (
      <div className={`${frame} overflow-hidden rounded-2xl bg-black`}>
        <iframe
          src={src}
          title={clip.title}
          className="size-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  if (!src) {
    return (
      <a
        href={clip.canonicalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => sendView(clipId)}
        className={`${frame} group zoom-frame relative block overflow-hidden rounded-2xl`}
      >
        <ClipThumb clip={clip} eager className="absolute inset-0 aspect-auto size-full" />
        <span className="absolute inset-0 grid place-items-center bg-black/35">
          <span className="bg-background/90 text-foreground flex min-h-11 items-center gap-2 rounded-full px-5 font-medium">
            Watch on {label} <ExternalLink className="size-4" aria-hidden />
          </span>
        </span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setPlaying(true);
        sendView(clipId);
      }}
      className={`${frame} group zoom-frame focus-visible:ring-ring/50 relative block overflow-hidden rounded-2xl focus-visible:ring-[3px] focus-visible:outline-none`}
      aria-label={`Play "${clip.title}" (loads the ${label} player)`}
    >
      <ClipThumb clip={clip} eager className="absolute inset-0 aspect-auto size-full" />
      <span className="absolute inset-0 grid place-items-center bg-black/25">
        <span className="bg-primary text-primary-foreground grid size-16 place-items-center rounded-full transition-transform duration-200 group-hover:scale-105 group-active:scale-95 md:size-20">
          <Play className="ml-1 size-7 fill-current md:size-8" aria-hidden />
        </span>
      </span>
      <span className="absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 font-mono text-xs text-white">
        Plays from {label}
      </span>
    </button>
  );
}
