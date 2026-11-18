import { Suspense } from "react";
import type { Metadata } from "next";
import { JsonLd } from "@/lib/seo";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getSession } from "@plunderclips/identity";
import { env } from "@plunderclips/shared";
import { SubmitForm } from "@/components/clips/submit-form";

export const metadata: Metadata = {
  title: "Submit a clip",
  description:
    "Send a Sea of Thieves clip from Twitch, YouTube, Kick, Medal, TikTok or X. No account needed.",
  alternates: { canonical: "/submit" },
};

/** Shown on the page and mirrored as FAQPage data, so answer engines quote what visitors read. */
const faq = [
  [
    "Do I need an account to submit a clip?",
    "No. Anyone can paste a public clip link. Signing in puts your name on the clip, and creators with a good track record skip the review queue.",
  ],
  [
    "Which platforms can I submit from?",
    "Twitch, YouTube, Kick, Medal, TikTok and X. Clips, full videos and YouTube Shorts all work, as long as the link is public.",
  ],
  [
    "When does my clip show up?",
    "Once a mod has checked it. Clips from trusted creators go live straight away.",
  ],
  [
    "Why would a clip be turned down?",
    "It isn't Sea of Thieves, it's a re-upload of someone else's clip instead of the original, or it harasses other players. Mods give a reason when they turn one down.",
  ],
  [
    "How does a clip get into This week?",
    "Approved clips can be voted on. The strongest go into This week, and the ones people keep sharing end up in Best of.",
  ],
] as const;

const rules = [
  ["Sea of Thieves only", "Anything else gets turned down, however good it is."],
  ["Credit the streamer", "Link to the original clip, not a re-upload."],
  ["Keep it fair", "No doxxing, slurs or harassment of other crews."],
] as const;

export default function SubmitPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map(([q, a]) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }}
      />
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
      <section aria-labelledby="faq-title" className="pb-24">
        <div className="wrap">
          <h2 id="faq-title" className="text-h2">
            Questions about submitting
          </h2>
          <dl className="divide-border mt-8 max-w-3xl divide-y">
            {faq.map(([q, a]) => (
              <div key={q} className="py-6">
                <dt className="text-lg font-medium">{q}</dt>
                <dd className="text-muted-foreground mt-2 max-w-[65ch]">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
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
