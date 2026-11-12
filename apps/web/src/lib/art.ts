import type { StaticImageData } from "next/image";
import type { Banner } from "@plunderclips/creators";
import fishermenAtSea from "../../public/art/fishermen-at-sea.jpg";
import moonlitNight from "../../public/art/moonlit-night.jpg";
import ninthWave from "../../public/art/ninth-wave.jpg";
import stormySea from "../../public/art/stormy-sea.jpg";
import temeraire from "../../public/art/temeraire.jpg";

/** Public-domain paintings by banner key, with alt text describing the scene. */
export const bannerArt: Record<Banner, { src: StaticImageData; alt: string }> = {
  "ninth-wave": { src: ninthWave, alt: "Survivors clinging to a mast in a huge sunlit wave" },
  "fishermen-at-sea": {
    src: fishermenAtSea,
    alt: "Two fishing boats riding a moonlit swell, a lantern glowing on deck",
  },
  temeraire: { src: temeraire, alt: "An old warship towed across calm water at sunset" },
  "stormy-sea": { src: stormySea, alt: "A sailing ship heeling over in a storm" },
  "moonlit-night": { src: moonlitNight, alt: "A ship under the moon on a dark, calm sea" },
};
