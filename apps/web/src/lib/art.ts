import type { StaticImageData } from "next/image";
import type { Banner } from "@plunderclips/creators";
import crewAshore from "../../public/art/crew-ashore.jpg";
import deckFight from "../../public/art/deck-fight.jpg";
import galleonBroadside from "../../public/art/galleon-broadside.webp";
import galleonCove from "../../public/art/galleon-cove.jpg";
import krakenSunset from "../../public/art/kraken-sunset.jpg";

/**
 * Sea of Thieves art, credited in the footer: artwork by Namaaay (@ArteInFlames), and official
 * screenshots by Rare, used under Microsoft's Game Content Usage Rules.
 */
export const art = {
  galleonCove: {
    src: galleonCove,
    alt: "A pirate holds up a gold coin on a jungle cliff while a galleon waits in the cove below",
  },
  crewAshore: {
    src: crewAshore,
    alt: "A crowd of pirates cheering on a sunny island beach under palm trees",
  },
  deckFight: {
    src: deckFight,
    alt: "A crew fires a cannon from a sloop's deck while a pirate charges with a sword",
  },
  galleonBroadside: {
    src: galleonBroadside,
    alt: "Cannonballs splinter the hull of a galleon on bright turquoise water",
  },
  krakenSunset: {
    src: krakenSunset,
    alt: "A galleon at sunset, surrounded by the tentacles of a kraken rising from the sea",
  },
} as const;

export const bannerArt: Record<Banner, { src: StaticImageData; alt: string }> = {
  "galleon-cove": art.galleonCove,
  "crew-ashore": art.crewAshore,
  "deck-fight": art.deckFight,
  "galleon-broadside": art.galleonBroadside,
  "kraken-sunset": art.krakenSunset,
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
