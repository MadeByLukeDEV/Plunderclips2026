import { connection } from "next/server";
import { creatorPage } from "@/lib/creators-data";
import { artDataUrl, ogCard, OG_SIZE } from "@/lib/og";

export const alt = "A Sea of Thieves creator on Plunderclips";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The creator's artwork banner behind their name (uploaded WebP banners can't be drawn here). */
const FILES: Record<string, string> = {
  "galleon-cove": "galleon-cove.jpg",
  "crew-ashore": "crew-ashore.jpg",
  "deck-fight": "deck-fight.jpg",
  "kraken-sunset": "kraken-sunset.jpg",
};

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  await connection();
  const { handle } = await params;
  const data = await creatorPage(handle, null);
  if (!data) return ogCard({ eyebrow: "Creator", title: "Not found" });
  const { profile } = data;
  return ogCard({
    eyebrow: `Creator · @${profile.handle}`,
    title: profile.displayName,
    subtitle: `${profile.followerCount} ${profile.followerCount === 1 ? "follower" : "followers"} on Plunderclips`,
    image: await artDataUrl(FILES[profile.banner] ?? "galleon-cove.jpg"),
  });
}
