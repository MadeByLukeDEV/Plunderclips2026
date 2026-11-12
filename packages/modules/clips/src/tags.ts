/** The tags mods can put on a clip. Slugs are stored; labels are for display. */
export const CLIP_TAGS = {
  pvp: "PvP",
  sailing: "Sailing",
  funny: "Funny",
  kraken: "Kraken",
  megalodon: "Megalodon",
  "skeleton-fleet": "Skeleton fleet",
  fort: "Forts",
  reaper: "Reaper's Bones",
  "tall-tale": "Tall tales",
  hourglass: "Hourglass",
  heist: "Heists",
  fishing: "Fishing",
} as const;

export type ClipTag = keyof typeof CLIP_TAGS;

export function isClipTag(v: unknown): v is ClipTag {
  return typeof v === "string" && Object.hasOwn(CLIP_TAGS, v);
}
