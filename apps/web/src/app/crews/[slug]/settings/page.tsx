import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCrewBySlug, standing } from "@plunderclips/social";
import { mediaEnabled } from "@plunderclips/media";
import { CrewForm } from "@/components/crews/crew-form";
import { ImageUpload } from "@/components/media/image-upload";
import { DisbandButton } from "@/components/crews/crew-buttons";
import { requireSession } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Crew settings", robots: { index: false } };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function CrewSettingsPage(props: Props) {
  return (
    <section aria-labelledby="crew-settings-title" className="screen">
      <div className="wrap">
        <Suspense fallback={<div className="bg-card h-96 max-w-2xl animate-pulse rounded-2xl" />}>
          <Settings {...props} />
        </Suspense>
      </div>
    </section>
  );
}

async function Settings({ params, searchParams }: Props) {
  const { slug } = await params;
  const uploadFailed = (await searchParams).upload === "failed";
  const session = await requireSession(`/crews/${slug}/settings`);
  const crew = await getCrewBySlug(slug);
  if (!crew) notFound();
  const s = await standing(crew.id, session.user.id);
  if (s.kind !== "member" || s.role !== "captain") notFound();

  return (
    <>
      <Link href={`/crews/${crew.slug}`} className="link-draw text-muted-foreground text-sm">
        Back to {crew.name}
      </Link>
      <h1 id="crew-settings-title" className="text-h2 mt-4">
        Crew settings
      </h1>
      <p className="text-muted-foreground mt-3 max-w-[56ch]">
        Officers and crewmates are managed on the crew page. Here you change how the crew looks and
        how people join.
      </p>
      {uploadFailed ? (
        <p
          role="alert"
          className="bg-card border-border mt-8 max-w-2xl rounded-xl border p-4 text-sm"
        >
          The crew is founded, but an image didn&apos;t upload. Try it again below.
        </p>
      ) : null}
      {mediaEnabled() ? (
        <div className="mt-10 grid max-w-2xl gap-10">
          <ImageUpload
            target="crew-logo"
            crewId={crew.id}
            current={crew.logoUrl}
            label="Crew logo"
            hint="Square, shown in crew lists and chat. At least 64 pixels, up to 8 MB."
            shape="logo"
          />
          <ImageUpload
            target="crew-banner"
            crewId={crew.id}
            current={crew.bannerUrl}
            label="Crew banner"
            hint="Shown instead of the artwork you pick below. Cropped to 3:1, up to 8 MB."
          />
        </div>
      ) : null}
      <div className="mt-10">
        <CrewForm
          crewId={crew.id}
          initial={{
            slug: crew.slug,
            name: crew.name,
            motto: crew.motto,
            banner: crew.banner,
            joinPolicy: crew.joinPolicy,
            sevenTvSetId: crew.sevenTvSetId,
          }}
        />
      </div>
      <div className="border-border mt-16 max-w-2xl rounded-2xl border border-dashed p-6">
        <h2 className="font-medium">Disband the crew</h2>
        <p className="text-muted-foreground mt-2 mb-4 text-sm">
          To leave but keep the crew going, make someone else captain on the crew page first.
        </p>
        <DisbandButton slug={crew.slug} name={crew.name} />
      </div>
    </>
  );
}
