import { artDataUrl, ogCard, OG_SIZE } from "@/lib/og";

export const alt = "Plunderclips: Sea of Thieves clips from streamers";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return ogCard({
    eyebrow: "Free to post · no account needed",
    title: "Sea of Thieves clips from streamers",
    subtitle: "Weekly picks, best-of reels and streamers to sail with.",
    image: await artDataUrl("galleon-cove.jpg"),
  });
}
