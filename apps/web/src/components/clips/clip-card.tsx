import Link from "next/link";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import type { ClipView } from "@plunderclips/clips";
import { formatDuration, platformMeta } from "./clip-meta";
import { ClipThumb } from "./clip-thumb";

export function ClipCard({ clip, eager = false }: { clip: ClipView; eager?: boolean }) {
  const meta = platformMeta[clip.platform];
  const duration = formatDuration(clip.durationSeconds);
  return (
    <article className="group relative">
      <div className="zoom-frame lift relative rounded-xl">
        <ClipThumb clip={clip} eager={eager} />
        {duration ? (
          <span className="absolute right-2 bottom-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-xs text-white">
            {duration}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 line-clamp-2 leading-snug font-medium">
        <Link
          href={`/clip/${clip.id}`}
          className="after:absolute after:inset-0 focus-visible:outline-none"
        >
          {clip.title}
        </Link>
      </h3>
      <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
        {meta.icon ? <PlatformIcon platform={meta.icon} className="size-4" /> : null}
        <span className="truncate">{clip.authorName ?? meta.label}</span>
      </p>
    </article>
  );
}

export function ClipGrid({ clips, eagerCount = 4 }: { clips: ClipView[]; eagerCount?: number }) {
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {clips.map((c, i) => (
        <li
          key={c.id}
          className="has-[a:focus-visible]:ring-ring/50 rounded-xl has-[a:focus-visible]:ring-[3px]"
        >
          <ClipCard clip={c} eager={i < eagerCount} />
        </li>
      ))}
    </ul>
  );
}
