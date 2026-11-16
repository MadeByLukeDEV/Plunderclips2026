import type { StaticImageData } from "next/image";
import type { Banner } from "@plunderclips/creators";
import crewAshore from "../../public/art/crew-ashore.jpg";
import galleonCove from "../../public/art/galleon-cove.jpg";

/** Sea of Thieves artwork by Namaaay (@ArteInFlames), credited in the footer. */
export const art = {
  galleonCove: {
    src: galleonCove,
    alt: "A pirate holds up a gold coin on a jungle cliff while a galleon waits in the cove below",
  },
  crewAshore: {
    src: crewAshore,
    alt: "A crowd of pirates cheering on a sunny island beach under palm trees",
  },
} as const;

export const bannerArt: Record<Banner, { src: StaticImageData; alt: string }> = {
  "galleon-cove": art.galleonCove,
  "crew-ashore": art.crewAshore,
};

/**
 * next/image props for a profile's or crew's banner: the uploaded one when set (already sized WebP,
 * so served as is), else the chosen artwork with its blur placeholder.
 */
export function bannerImage(e: { banner: Banner; bannerUrl: string | null }, alt?: string) {
  if (e.bannerUrl)
    return { src: e.bannerUrl, alt: alt ?? "", unoptimized: true, placeholder: "empty" as const };
  const a = bannerArt[e.banner];
  return { src: a.src, alt: alt ?? a.alt, unoptimized: false, placeholder: "blur" as const };
}
