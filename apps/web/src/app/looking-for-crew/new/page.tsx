import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getProfileByUser } from "@plunderclips/creators";
import { LFC_DAYS, listMyCrews } from "@plunderclips/social";
import { Button } from "@plunderclips/ui/components/button";
import { LfcForm } from "@/components/collab/lfc-form";
import { requireSession } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Post: looking for crew", robots: { index: false } };

export default function NewLfcPage() {
  return (
    <section aria-labelledby="new-lfc-title" className="screen">
      <div className="wrap">
        <h1 id="new-lfc-title" className="text-h2">
          Looking for crew
        </h1>
        <p className="text-muted-foreground mt-3 max-w-[56ch]">
          Say what you&apos;re after. The post stays up for {LFC_DAYS} days, and anyone who reads it
          can message you.
        </p>
        <div className="mt-10">
          <Suspense fallback={<div className="bg-card h-96 max-w-2xl animate-pulse rounded-2xl" />}>
            <Form />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

async function Form() {
  const session = await requireSession("/looking-for-crew/new");
  const profile = await getProfileByUser(session.user.id);
  if (!profile)
    return (
      <div className="border-border max-w-2xl rounded-2xl border border-dashed p-8">
        <p className="text-h3 font-medium">Make your creator page first</p>
        <p className="text-muted-foreground mt-3 max-w-[50ch]">
          Posts link to your page, so people can see where you stream before they message you.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/dashboard/profile">Make your page</Link>
        </Button>
      </div>
    );
  const { crews } = await listMyCrews(session.user.id);
  return (
    <LfcForm
      crews={crews.filter((c) => c.role !== "deckhand").map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
