import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSession, rolesOf } from "@plunderclips/identity";
import { isStaff } from "@plunderclips/moderation";
import {
  listCrewRequests,
  standing,
  type Crew,
  type CrewMember,
  type CrewRole,
} from "@plunderclips/social";
import { Button } from "@plunderclips/ui/components/button";
import { Avatar } from "@/components/creators/avatar";
import {
  DisbandButton,
  JoinControls,
  MemberButtons,
  RequestButtons,
} from "@/components/crews/crew-buttons";
import { bannerArt } from "@/lib/art";
import { crewPage } from "@/lib/crews-data";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await crewPage(slug);
  if (!data) return { title: "Crew not found", robots: { index: false } };
  const { crew } = data;
  const description = crew.motto || `${crew.name}: a Sea of Thieves streamer crew on Plunderclips.`;
  return {
    title: crew.name,
    description,
    alternates: { canonical: `/crews/${crew.slug}` },
    openGraph: { title: crew.name, description },
  };
}

export default function CrewPage(props: Props) {
  return (
    <Suspense fallback={<Fallback />}>
      <Content {...props} />
    </Suspense>
  );
}

const ROLE_LABEL: Record<CrewRole, [string, string]> = {
  captain: ["Captain", "Captain"],
  officer: ["Officer", "Officers"],
  deckhand: ["Deckhand", "Deckhands"],
};

async function Content({ params }: Props) {
  const { slug } = await params;
  const data = await crewPage(slug);
  if (!data) notFound();
  const { crew, members } = data;
  const art = bannerArt[crew.banner];
  const groups = (["captain", "officer", "deckhand"] as const)
    .map((role) => [role, members.filter((m) => m.role === role)] as const)
    .filter(([, list]) => list.length);

  return (
    <>
      <section
        aria-labelledby="crew-name"
        className="pt-[calc(var(--header-h)+16px)] pb-12 md:pb-16"
      >
        <div className="wrap">
          <div className="relative aspect-[3/1] overflow-hidden rounded-2xl md:aspect-[4/1]">
            <Image
              src={art.src}
              alt={art.alt}
              fill
              preload
              placeholder="blur"
              sizes="(min-width: 1360px) 1280px, 100vw"
              className="object-cover"
            />
          </div>
          <div className="grid-12 mt-8">
            <div className="col-span-12 min-w-0 md:col-span-7">
              <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                Crew · {crew.memberCount} {crew.memberCount === 1 ? "member" : "members"} ·{" "}
                {crew.joinPolicy === "open" ? "open to join" : "join by request"}
              </p>
              <h1 id="crew-name" className="text-h2 mt-3">
                {crew.name}
              </h1>
              {crew.motto ? <p className="text-lead mt-4 max-w-[60ch]">{crew.motto}</p> : null}
            </div>
            <div className="col-span-12 mt-6 md:col-span-4 md:col-start-9 md:mt-0 md:justify-self-end">
              <Suspense fallback={<div className="bg-card h-12 w-48 animate-pulse rounded-lg" />}>
                <Viewer crew={crew} />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <Manage crew={crew} members={members} />
      </Suspense>

      <section aria-labelledby="crew-roster" className="pb-24">
        <div className="wrap">
          <h2 id="crew-roster" className="text-h3 font-medium">
            Who sails with {crew.name}
          </h2>
          <div className="mt-8 grid gap-10">
            {groups.map(([role, list]) => (
              <div key={role}>
                <h3 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                  {ROLE_LABEL[role][list.length === 1 ? 0 : 1]}
                </h3>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((m) => (
                    <li key={m.userId}>
                      <Link
                        href={`/c/${m.handle}`}
                        className="lift border-border bg-card flex items-center gap-4 rounded-xl border p-4"
                      >
                        <Avatar
                          name={m.displayName}
                          image={m.image}
                          className="size-11 text-[44px]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{m.displayName}</span>
                          <span className="text-muted-foreground block truncate font-mono text-xs">
                            @{m.handle}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/** Per visitor, outside the cache: join, request, leave, or sign in first. */
async function Viewer({ crew }: { crew: Crew }) {
  await connection();
  const session = await getSession(await headers());
  if (!session)
    return (
      <Button asChild size="lg">
        <Link href={`/sign-in?next=/crews/${crew.slug}`}>
          {crew.joinPolicy === "open" ? "Sign in to join" : "Sign in to ask"}
        </Link>
      </Button>
    );
  const s = await standing(crew.id, session.user.id);
  const kind = s.kind === "member" ? (s.role === "captain" ? "captain" : "member") : s.kind;
  return (
    <div className="grid gap-3 md:justify-items-end">
      {kind === "captain" || kind === "member" ? (
        <Button asChild size="lg">
          <Link href={`/chat/crew/${crew.slug}`}>Crew chat</Link>
        </Button>
      ) : null}
      {kind === "captain" ? (
        <Button asChild variant="secondary" size="lg">
          <Link href={`/crews/${crew.slug}/settings`}>Crew settings</Link>
        </Button>
      ) : (
        <JoinControls slug={crew.slug} policy={crew.joinPolicy} standing={kind} />
      )}
    </div>
  );
}

/** Captain and officers: waiting requests and member controls. Site staff: disband. */
async function Manage({ crew, members }: { crew: Crew; members: CrewMember[] }) {
  await connection();
  const session = await getSession(await headers());
  if (!session) return null;
  const s = await standing(crew.id, session.user.id);
  const role = s.kind === "member" && s.role !== "deckhand" ? s.role : null;
  const staff = !role && isStaff({ id: session.user.id, roles: rolesOf(session) });
  if (!role && !staff) return null;

  if (!role)
    return (
      <section aria-labelledby="crew-staff" className="pb-12">
        <div className="wrap">
          <div className="border-border rounded-2xl border border-dashed p-6">
            <h2 id="crew-staff" className="font-medium">
              Moderation
            </h2>
            <p className="text-muted-foreground mt-2 mb-4 text-sm">
              Disbanding removes the crew for everyone and is logged in the audit log.
            </p>
            <DisbandButton slug={crew.slug} name={crew.name} />
          </div>
        </div>
      </section>
    );

  const requests = await listCrewRequests(crew.id);
  const crewmates = members.filter((m) => m.role !== "captain" && m.userId !== session.user.id);

  return (
    <section aria-labelledby="crew-manage" className="pb-16">
      <div className="wrap">
        <div className="bg-card border-border rounded-2xl border p-6 md:p-8">
          <h2 id="crew-manage" className="text-h3 font-medium">
            Run the crew
          </h2>
          <div className="mt-6 grid gap-10 lg:grid-cols-2">
            <div>
              <h3 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                Waiting to join ({requests.length})
              </h3>
              {requests.length ? (
                <ul className="divide-border mt-3 divide-y">
                  {requests.map((r) => (
                    <li key={r.userId} className="grid gap-3 py-4">
                      <Link href={`/c/${r.handle}`} className="flex items-center gap-3">
                        <Avatar
                          name={r.displayName}
                          image={r.image}
                          className="size-10 text-[40px]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.displayName}</span>
                          <span className="text-muted-foreground block font-mono text-xs">
                            @{r.handle}
                          </span>
                        </span>
                      </Link>
                      {r.message ? <p className="text-sm">&ldquo;{r.message}&rdquo;</p> : null}
                      <RequestButtons slug={crew.slug} userId={r.userId} name={r.displayName} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-3 text-sm">Nobody waiting right now.</p>
              )}
            </div>
            <div>
              <h3 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                Crewmates ({crewmates.length})
              </h3>
              {crewmates.length ? (
                <ul className="divide-border mt-3 divide-y">
                  {crewmates.map((m) => (
                    <li key={m.userId} className="grid gap-3 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={m.displayName}
                          image={m.image}
                          className="size-10 text-[40px]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{m.displayName}</span>
                          <span className="text-muted-foreground block font-mono text-xs">
                            {ROLE_LABEL[m.role][0]}
                          </span>
                        </span>
                      </div>
                      {role === "captain" || m.role === "deckhand" ? (
                        <MemberButtons
                          slug={crew.slug}
                          userId={m.userId}
                          name={m.displayName}
                          role={m.role as "officer" | "deckhand"}
                          viewer={role}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-3 text-sm">
                  Just you so far. Share the crew’s link with your regulars.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fallback() {
  return (
    <section aria-hidden className="pt-[calc(var(--header-h)+16px)]">
      <div className="wrap">
        <div className="bg-card aspect-[3/1] animate-pulse rounded-2xl md:aspect-[4/1]" />
        <div className="bg-card mt-8 h-10 w-72 animate-pulse rounded-lg" />
      </div>
    </section>
  );
}
