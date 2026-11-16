/**
 * Banner choices: the artwork shipped in apps/web/public/art (credited in the footer).
 * Keys only; the web app maps them to its images. No uploads, so nothing to moderate.
 */
export const BANNERS = {
  "galleon-cove": "Galleon at the cove",
  "crew-ashore": "The crew ashore",
} as const;

export type Banner = keyof typeof BANNERS;

/** Used for new pages and for rows saved with a banner that no longer exists (the old paintings). */
export const DEFAULT_BANNER: Banner = "galleon-cove";

export function isBanner(v: unknown): v is Banner {
  return typeof v === "string" && Object.hasOwn(BANNERS, v);
}
