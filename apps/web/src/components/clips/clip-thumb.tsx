import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { cn } from "@plunderclips/ui/lib/utils";
import type { ClipView } from "@plunderclips/clips";
import { platformMeta } from "./clip-meta";

/** 16:9 thumbnail from the platform, or a parchment placeholder with the platform mark. */
export function ClipThumb({
  clip,
  className,
  eager = false,
}: {
  clip: Pick<ClipView, "thumbnailUrl" | "platform">;
  className?: string;
  eager?: boolean;
}) {
  const meta = platformMeta[clip.platform];
  return (
    <div className={cn("bg-card relative aspect-video overflow-hidden", className)}>
      {clip.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnails come from many platform CDNs
        <img
          src={clip.thumbnailUrl}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="band-parchment bg-background text-muted-foreground absolute inset-0 grid place-items-center">
          {meta.icon ? (
            <PlatformIcon platform={meta.icon} className="size-10 opacity-70" />
          ) : (
            <span className="font-mono text-sm tracking-wider uppercase">{meta.label}</span>
          )}
        </div>
      )}
    </div>
  );
}
