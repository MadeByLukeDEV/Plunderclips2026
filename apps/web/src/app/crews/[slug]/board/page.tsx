import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCrewBySlug, listBoard, standing } from "@plunderclips/social";
import { Board } from "@/components/collab/board";
import { CrewTabs } from "@/components/collab/crew-tabs";
import { requireSession } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Crew board", robots: { index: false } };

type Props = { params: Promise<{ slug: string }> };

export default function BoardPage(props: Props) {
  return (
    <section aria-labelledby="board-title" className="pt-[calc(var(--header-h)+32px)] pb-24">
      <div className="wrap">
        <Suspense fallback={<div className="bg-card h-96 animate-pulse rounded-2xl" />}>
          <Content {...props} />
        </Suspense>
      </div>
    </section>
  );
}

async function Content({ params }: Props) {
  const { slug } = await params;
  const session = await requireSession(`/crews/${slug}/board`);
  const crew = await getCrewBySlug(slug);
  if (!crew) notFound();
  const s = await standing(crew.id, session.user.id);
  if (s.kind !== "member") notFound();
  const items = (await listBoard(crew.id, session.user.id)) ?? [];
  const leads = s.role !== "deckhand";
  return (
    <>
      <CrewTabs slug={crew.slug} current="board" />
      <h1 id="board-title" className="text-h2 mt-6">
        {crew.name}: board
      </h1>
      <p className="text-muted-foreground mt-3 max-w-[60ch]">
        Ideas for streams, collabs and voyages. Only the crew sees this. Move a card along when
        it&apos;s planned, and again when it&apos;s done.
      </p>
      <div className="mt-8">
        <Board
          crewId={crew.id}
          items={items.map((i) => ({
            id: i.id,
            title: i.title,
            notes: i.notes,
            status: i.status,
            authorName: i.authorName,
            canEdit: leads || i.authorId === session.user.id,
          }))}
        />
      </div>
    </>
  );
}
