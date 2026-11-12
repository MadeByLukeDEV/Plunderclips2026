/**
 * Banner choices: the public-domain marine paintings already shipped in apps/web/public/art.
 * Keys only; the web app maps them to its images. No uploads, so nothing to moderate.
 */
export const BANNERS = {
  "ninth-wave": "The Ninth Wave",
  "fishermen-at-sea": "Fishermen at Sea",
  temeraire: "The Fighting Temeraire",
  "stormy-sea": "Ship in the Stormy Sea",
  "moonlit-night": "A Moonlit Night at Sea",
} as const;

export type Banner = keyof typeof BANNERS;

export function isBanner(v: unknown): v is Banner {
  return typeof v === "string" && Object.hasOwn(BANNERS, v);
}
