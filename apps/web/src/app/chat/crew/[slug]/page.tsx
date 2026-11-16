import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { crewChannelId, getCrewBySlug, standing } from "@plunderclips/social";
import { requireSession } from "@/lib/auth-guard";

type Props = { params: Promise<{ slug: string }> };

/** /chat/crew/<slug>: the crew's channel, for members. */
export default function CrewChatPage(props: Props) {
  return (
    <Suspense fallback={<div className="bg-card h-[70svh] animate-pulse rounded-2xl" />}>
      <Go {...props} />
    </Suspense>
  );
}

async function Go({ params }: Props) {
  const { slug } = await params;
  const session = await requireSession(`/chat/crew/${slug}`);
  const crew = await getCrewBySlug(slug);
  if (!crew) notFound();
  const s = await standing(crew.id, session.user.id);
  if (s.kind !== "member") notFound();
  return redirect(`/chat/${await crewChannelId(crew.id)}`);
}
