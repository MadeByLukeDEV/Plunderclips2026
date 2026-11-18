import { connection } from "next/server";
import { platformMeta } from "@/components/clips/clip-meta";
import { clipPage } from "@/lib/clips-data";
import { artDataUrl, ogCard, OG_SIZE } from "@/lib/og";

export const alt = "A Sea of Thieves clip on Plunderclips";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const data = await clipPage(id);
  if (!data)
    return ogCard({
      eyebrow: "Clip",
      title: "Clip not found",
      image: await artDataUrl("kraken-sunset.jpg"),
    });
  const { clip } = data;
  return ogCard({
    eyebrow: `Clip · ${platformMeta[clip.platform].label}`,
    title: clip.title,
    subtitle: clip.authorName ? `by ${clip.authorName}` : undefined,
    image: clip.thumbnailUrl ?? (await artDataUrl("deck-fight.jpg")),
  });
}
