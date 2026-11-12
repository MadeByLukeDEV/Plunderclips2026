import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { PlatformIcon, type Platform } from "@plunderclips/ui/components/platform-icon";
import SplitText from "@plunderclips/ui/components/split-text";
import { Enter } from "@plunderclips/ui/motion/enter";
import { WordHighlight } from "@plunderclips/ui/motion/word-highlight";
import heroArt from "../../public/art/fishermen-at-sea.jpg";
import ninthWave from "../../public/art/ninth-wave.jpg";
import temeraire from "../../public/art/temeraire.jpg";
import stormySea from "../../public/art/stormy-sea.jpg";

/*
  Deal (taste skill): kind gaming · palette walnut-tan · type Mona Sans + Geist Mono (Fraunces added for display)
  hero film · nav mega · footer dark · close type · rhythm space · buttons solid · mark wordmark
  moments: word-highlight (statement), line-carries-colour (deferred: needs real clip data)
  Art: public-domain marine paintings stand in for key art until community clips exist.
*/

const platforms: { id: Platform; name: string }[] = [
  { id: "twitch", name: "Twitch" },
  { id: "youtube", name: "YouTube" },
  { id: "kick", name: "Kick" },
  { id: "tiktok", name: "TikTok" },
];

const sections = [
  {
    href: "/clips/weekly",
    title: "This week",
    body: "The top clips of the last seven days, ranked by the crew and refreshed every Monday.",
    art: ninthWave,
    alt: "A huge green wave breaking under a golden storm sky, survivors clinging to a mast",
  },
  {
    href: "/clips/best-of",
    title: "Best of",
    body: "The clips people still send each other months later. Krakens, sinks and steals.",
    art: temeraire,
    alt: "An old warship towed across calm water at sunset",
  },
  {
    href: "/clips/featured",
    title: "Featured",
    body: "Mods pick a handful each week and put the streamer's channel right beside the clip.",
    art: stormySea,
    alt: "A sailing ship heeling over in dark, stormy seas",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero: film frame, words in a parchment box on the frame's dark foot */}
      <section aria-label="Introduction" className="wrap pt-4 pb-4">
        <Enter className="relative h-[calc(100svh-var(--header-h)-2rem)] min-h-[560px] overflow-hidden rounded-2xl">
          <Image
            src={heroArt}
            alt="Two fishing boats riding a moonlit swell, a lantern glowing on deck"
            fill
            priority
            placeholder="blur"
            sizes="(min-width: 1360px) 1280px, 100vw"
            className="object-cover object-[35%_45%]"
          />
          <div className="band-parchment bg-background text-foreground absolute inset-x-3 bottom-3 rounded-xl p-6 sm:inset-x-auto sm:right-8 sm:bottom-8 sm:max-w-[600px] sm:p-12">
            <p data-enter className="font-mono text-xs tracking-wider uppercase">
              Free to post · no account needed
            </p>
            <SplitText
              tag="h1"
              text="Sea of Thieves clips from streamers"
              splitType="words"
              mask
              effect="rise"
              trigger="load"
              delay={60}
              duration={1}
              textAlign="left"
              className="text-display mt-4 block max-w-[15ch]"
            />
            <p data-enter className="text-lead text-muted-foreground mt-5 max-w-[42ch]">
              Drop a Twitch, YouTube or Kick link. The best clips sail into the weekly picks, and
              the streamers behind them get found by new crewmates.
            </p>
            <div data-enter className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/submit">Submit a clip</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/clips/weekly">Watch this week&apos;s picks</Link>
              </Button>
            </div>
          </div>
        </Enter>
      </section>

      {/* How it works */}
      <section
        aria-labelledby="how-title"
        className="wrap flex min-h-svh flex-col justify-center py-24"
      >
        <h2 id="how-title" className="text-h2 max-w-[18ch]">
          From link to harbour in three steps
        </h2>
        <ol className="mt-14 grid gap-4 md:grid-cols-3">
          <li className="border-border bg-card rounded-2xl border p-8">
            <span className="text-primary font-mono text-sm">01</span>
            <h3 className="text-h3 mt-6 font-medium">Paste the link</h3>
            <p className="text-muted-foreground mt-3">
              Any public clip or video. No sign-up, no upload, just the URL and a title.
            </p>
            <ul className="mt-8 flex flex-wrap gap-3" aria-label="Supported platforms">
              {platforms.map((p) => (
                <li
                  key={p.id}
                  className="border-border flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                >
                  <PlatformIcon platform={p.id} className="size-4" />
                  {p.name}
                </li>
              ))}
            </ul>
          </li>
          <li className="border-border bg-card rounded-2xl border p-8">
            <span className="text-primary font-mono text-sm">02</span>
            <h3 className="text-h3 mt-6 font-medium">A mod gives it a look</h3>
            <p className="text-muted-foreground mt-3">
              Every anonymous clip goes through the review queue first, which keeps spam and stolen
              clips out. Signed-in creators with a track record skip the wait.
            </p>
          </li>
          <li className="border-border bg-card rounded-2xl border p-8">
            <span className="text-primary font-mono text-sm">03</span>
            <h3 className="text-h3 mt-6 font-medium">It finds its section</h3>
            <p className="text-muted-foreground mt-3">
              Approved clips go live straight away. Votes push the strongest into This week, and
              from there into Best of.
            </p>
          </li>
        </ol>
      </section>

      {/* Statement moment */}
      <section aria-label="Why Plunderclips" className="wrap flex min-h-svh items-center py-24">
        <WordHighlight
          parts={[
            "Every crew has that one clip: the last-second kraken dodge, the sloop that stole a reaper chest.",
            { strong: "Plunderclips" },
            "gives it a harbour and puts the streamer who caught it in front of new crewmates.",
          ]}
        />
      </section>

      {/* Sections */}
      <section
        aria-labelledby="sections-title"
        className="wrap flex min-h-svh flex-col justify-center py-24"
      >
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <h2 id="sections-title" className="text-h2 max-w-[16ch]">
            Three ways to watch the sea
          </h2>
          <Link href="/clips" className="link-draw inline-flex min-h-11 items-center gap-2 text-lg">
            Browse all clips <ArrowRight className="size-5" />
          </Link>
        </div>
        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {sections.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="lift group border-border bg-card block h-full overflow-hidden rounded-2xl border"
              >
                <div className="zoom-frame relative aspect-[4/3]">
                  <Image
                    src={s.art}
                    alt={s.alt}
                    fill
                    placeholder="blur"
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-8">
                  <h3 className="text-h3 flex items-center justify-between font-medium">
                    {s.title}
                    <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </h3>
                  <p className="text-muted-foreground mt-3">{s.body}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Creators: parchment band */}
      <section
        aria-labelledby="creators-title"
        className="band-parchment bg-background text-foreground"
      >
        <div className="wrap grid min-h-svh items-center gap-12 py-24 md:grid-cols-2">
          <div>
            <h2 id="creators-title" className="text-h2 max-w-[16ch]">
              One profile for every channel you stream on
            </h2>
            <p className="text-lead text-muted-foreground mt-6 max-w-[48ch]">
              Sign in with Twitch, Discord, Kick or YouTube, then link the rest. Your clips,
              channels and crew live on one page that other streamers can find.
            </p>
            <div className="mt-10">
              <Button asChild size="lg">
                <Link href="/sign-in">Create your profile</Link>
              </Button>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-4" aria-label="Sign-in options">
            {(
              [
                ["twitch", "Twitch"],
                ["discord", "Discord"],
                ["kick", "Kick"],
                ["youtube", "YouTube"],
              ] as const
            ).map(([id, name]) => (
              <li
                key={id}
                className="flex aspect-[4/3] flex-col justify-between rounded-2xl bg-[#2b2216] p-6 text-[#e4e2da]"
              >
                <PlatformIcon platform={id} className="size-10" />
                <span className="text-lg font-medium">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Close: type */}
      <section
        aria-labelledby="close-title"
        className="wrap flex min-h-[80svh] flex-col items-start justify-center py-24"
      >
        <h2
          id="close-title"
          className="max-w-[12ch] text-[clamp(3rem,1.5rem+7vw,8rem)] leading-[0.95]"
        >
          Got a clip worth seeing?
        </h2>
        <div className="mt-12">
          <Button asChild size="lg">
            <Link href="/submit">Submit a clip</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
