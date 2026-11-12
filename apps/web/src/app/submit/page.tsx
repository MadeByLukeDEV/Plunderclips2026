import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getSession } from "@plunderclips/identity";
import { env } from "@plunderclips/shared";
import { SubmitForm } from "@/components/clips/submit-form";

export const metadata: Metadata = {
  title: "Submit a clip",
  description:
    "Send a Sea of Thieves clip from Twitch, YouTube, Kick, Medal, TikTok or X. No account needed.",
};

const rules = [
  ["Sea of Thieves only", "Anything else gets turned down, however good it is."],
  ["Credit the streamer", "Link to the original clip, not a re-upload."],
  ["Keep it fair", "No doxxing, slurs or harassment of other crews."],
] as const;

export default function SubmitPage() {
  return (
    <section aria-labelledby="submit-title" className="screen">
      <div className="wrap grid-12 content-center items-start">
        <div className="col-span-12 min-w-0 md:col-span-7">
          <h1 id="submit-title" className="text-h2">
            Submit a clip
          </h1>
          <p className="text-lead text-muted-foreground mt-4 max-w-[48ch]">
            Paste the link. We pull the title and thumbnail from the platform, and a mod checks it
            before it goes up.
          </p>
          <div className="mt-10 max-w-xl">
            <Suspense fallback={<FormSkeleton />}>
              <Form />
            </Suspense>
          </div>
        </div>
        <aside
          aria-labelledby="rules-title"
          className="border-border col-span-12 mt-14 border-t pt-8 md:col-span-4 md:col-start-9 md:mt-2 md:border-t-0 md:border-l md:pt-0 md:pl-8"
        >
          <h2
            id="rules-title"
            className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
          >
            What gets in
          </h2>
          <dl className="mt-6 grid gap-6">
            {rules.map(([term, detail]) => (
              <div key={term}>
                <dt className="font-medium">{term}</dt>
                <dd className="text-muted-foreground mt-1 text-sm">{detail}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </section>
  );
}

async function Form() {
  await connection();
  const session = await getSession(await headers());
  return (
    <SubmitForm
      // Read at request time (not NEXT_PUBLIC_*, which Next bakes in at build time).
      siteKey={env().TURNSTILE_SITE_KEY ?? null}
      signedInAs={session?.user.name ?? null}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden>
      <div className="bg-card h-11 animate-pulse rounded-lg" />
      <div className="bg-card h-24 animate-pulse rounded-lg" />
      <div className="bg-card h-12 w-40 animate-pulse rounded-lg" />
    </div>
  );
}
