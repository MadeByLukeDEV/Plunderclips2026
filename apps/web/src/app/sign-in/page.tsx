import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { devLoginEnabled, enabledProviders, getSession } from "@plunderclips/identity";
import { DevLogin } from "@/components/auth/dev-login";
import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { isProviderKey } from "@/components/auth/providers";
import { safeNext } from "@/lib/safe-next";
import art from "../../../public/art/temeraire.jpg";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Plunderclips with Twitch, Discord, Kick or YouTube.",
  robots: { index: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function SignInPage({ searchParams }: Props) {
  return (
    <section aria-labelledby="sign-in-title" className="screen">
      <div className="wrap grid-12 content-center items-start">
        <div className="col-span-12 md:col-span-6 lg:col-span-5">
          <h1 id="sign-in-title" className="text-h2">
            Sign in to Plunderclips
          </h1>
          <p className="text-lead text-muted-foreground mt-4 max-w-[44ch]">
            Use the platform you stream on. You can link the others from your dashboard afterwards,
            so every channel lands on one profile.
          </p>
          <div className="mt-10">
            <Suspense fallback={<ButtonsSkeleton />}>
              <Providers searchParams={searchParams} />
            </Suspense>
          </div>
          <p className="text-muted-foreground mt-8 text-sm">
            Posting a clip doesn&apos;t need an account. Signing in adds a profile, faster approval
            once you have a track record, and your name on your clips.
          </p>
        </div>
        <div className="relative col-span-12 mt-12 hidden aspect-[4/3] overflow-hidden rounded-2xl md:col-span-6 md:col-start-7 md:mt-0 md:block lg:col-span-7 lg:col-start-6">
          <Image
            src={art}
            alt="An old warship towed across calm water at sunset"
            fill
            placeholder="blur"
            sizes="(min-width: 1024px) 55vw, 50vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}

async function Providers({ searchParams }: Props) {
  await connection();
  const params = await searchParams;
  const next = safeNext(params.next);
  const session = await getSession(await headers());
  if (session) redirect(next);

  const providers = enabledProviders().filter(isProviderKey);
  const dev = devLoginEnabled() ? <DevLogin next={next} /> : null;
  if (providers.length === 0) {
    if (dev) return dev;
    return (
      <p
        role="status"
        className="border-border bg-card text-muted-foreground rounded-xl border p-5"
      >
        Sign-in isn&apos;t switched on yet. An admin needs to add the OAuth credentials for at least
        one platform.
      </p>
    );
  }
  return (
    <>
      <SignInButtons providers={providers} next={next} />
      {dev}
    </>
  );
}

function ButtonsSkeleton() {
  return (
    <div className="grid gap-3" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-card h-12 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}
