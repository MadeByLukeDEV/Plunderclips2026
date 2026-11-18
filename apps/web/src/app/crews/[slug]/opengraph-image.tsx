import { connection } from "next/server";
import { crewPage } from "@/lib/crews-data";
import { artDataUrl, ogCard, OG_SIZE } from "@/lib/og";

export const alt = "A Sea of Thieves crew on Plunderclips";
export const size = OG_SIZE;
export const contentType = "image/png";

const FILES: Record<string, string> = {
  "galleon-cove": "galleon-cove.jpg",
  "crew-ashore": "crew-ashore.jpg",
  "deck-fight": "deck-fight.jpg",
  "kraken-sunset": "kraken-sunset.jpg",
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const data = await crewPage(slug);
  if (!data) return ogCard({ eyebrow: "Crew", title: "Not found" });
  const { crew } = data;
  return ogCard({
    eyebrow: `Crew · ${crew.memberCount} ${crew.memberCount === 1 ? "member" : "members"}`,
    title: crew.name,
    subtitle: crew.motto || (crew.joinPolicy === "open" ? "Open to join" : "Join by request"),
    image: await artDataUrl(FILES[crew.banner] ?? "crew-ashore.jpg"),
  });
}
