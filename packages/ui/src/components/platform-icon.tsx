import {
  siDiscord,
  siKick,
  siTiktok,
  siTwitch,
  siX,
  siYoutube,
  type SimpleIcon,
} from "simple-icons";
import { cn } from "../lib/utils";

const ICONS = {
  twitch: siTwitch,
  youtube: siYoutube,
  kick: siKick,
  discord: siDiscord,
  tiktok: siTiktok,
  x: siX,
} satisfies Record<string, SimpleIcon>;

export type Platform = keyof typeof ICONS;

/** Real brand mark in its own colour (monochrome marks use the text colour so they stay visible). */
export function PlatformIcon({
  platform,
  className,
  title,
}: {
  platform: Platform;
  className?: string;
  title?: string;
}) {
  const icon = ICONS[platform];
  const mono = icon.hex === "000000";
  return (
    <svg
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("size-5 shrink-0", className)}
      fill={mono ? "currentColor" : `#${icon.hex}`}
    >
      <path d={icon.path} />
    </svg>
  );
}
