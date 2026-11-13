import type { Platform as IconPlatform } from "@plunderclips/ui/components/platform-icon";

type ClipPlatform = "twitch" | "youtube" | "kick" | "medal" | "tiktok" | "x";

export const platformMeta: Record<ClipPlatform, { label: string; icon: IconPlatform | null }> = {
  twitch: { label: "Twitch", icon: "twitch" },
  youtube: { label: "YouTube", icon: "youtube" },
  kick: { label: "Kick", icon: "kick" },
  medal: { label: "Medal", icon: null },
  tiktok: { label: "TikTok", icon: "tiktok" },
  x: { label: "X", icon: "x" },
};

/** 75 → "1:15", 3723 → "1:02:03" */
export function formatDuration(s: number | null | undefined): string | null {
  if (!s || s < 1) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  // Fixed locale and timezone: client components render this on the server and again in the
  // browser, and both must produce the same string or hydration breaks.
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
