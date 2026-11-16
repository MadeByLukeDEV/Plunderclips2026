import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getProfileByUser, suggestHandle } from "@plunderclips/creators";
import { Button } from "@plunderclips/ui/components/button";
import { mediaEnabled } from "@plunderclips/media";
import { CrewForm } from "@/components/crews/crew-form";
import { requireSession } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Found a crew", robots: { index: false } };

export default function NewCrewPage() {
  return (
    <section aria-labelledby="new-crew-title" className="screen">
      <div className="wrap">
        <h1 id="new-crew-title" className="text-h2">
          Found a crew
        </h1>
        <p className="text-muted-foreground mt-3 max-w-[56ch]">
          You’ll be its captain. Pick a name and a link, and decide whether people join straight
          away or ask first.
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
  const session = await requireSession("/crews/new");
  const profile = await getProfileByUser(session.user.id);
  if (!profile)
    return (
      <div className="border-border max-w-2xl rounded-2xl border border-dashed p-8">
        <p className="text-h3 font-medium">Make your creator page first</p>
        <p className="text-muted-foreground mt-3 max-w-[50ch]">
          Crews are made of creators, and every member links to their page. It takes a minute.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/dashboard/profile">Make your page</Link>
        </Button>
      </div>
    );
  return (
    <CrewForm
      uploads={mediaEnabled()}
      initial={{
        slug: suggestHandle(`${profile.displayName} crew`),
        name: "",
        motto: "",
        banner: "galleon-cove",
        joinPolicy: "request",
        sevenTvSetId: null,
      }}
    />
  );
}
