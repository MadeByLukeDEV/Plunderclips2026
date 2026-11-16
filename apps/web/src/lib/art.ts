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
