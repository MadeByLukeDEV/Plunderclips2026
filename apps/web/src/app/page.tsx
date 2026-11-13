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
import moonlitNight from "../../public/art/moonlit-night.jpg";
import stormySea from "../../public/art/stormy-sea.jpg";

/*
  Deal (taste skill): kind gaming · palette walnut-tan · type Mona Sans + Geist Mono (Fraunces added for display)
  hero film · nav mega · footer dark · close type · rhythm space · buttons solid · mark wordmark
  moments: word-highlight (statement). Art: public-domain marine paintings stand in for key art.
  Layout: fixed header; every section one screen (.screen) with one .wrap on a 12-column grid.
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
    art: moonlitNight,
    alt: "A sailing ship under a full moon on a calm night sea",
  },
];

const signIns = [
  ["twitch", "Twitch"],
  ["discord", "Discord"],
  ["kick", "Kick"],
  ["youtube", "YouTube"],
] as const;

export default function HomePage() {
  return (
    <>
      {/* Hero: film frame filling the first screen under the fixed header; words in a parchment box */}
      <section
        aria-label="Introduction"
        className="flex h-svh min-h-[640px] pt-[calc(var(--header-h)+16px)] pb-6"
      >
        <Enter className="wrap relative overflow-hidden rounded-2xl">
          <Image
            src={heroArt}
            alt="Two fishing boats riding a moonlit swell, a lantern glowing on deck"
            fill
            preload
            placeholder="blur"
            /* On phones the painting fills the screen height (about 260vw wide). Asking for 110vw keeps
               it near 1x pixel density instead of the full original: a quarter of the bytes for LCP. */
            sizes="(min-width: 1360px) 1280px, (min-width: 768px) 100vw, 110vw"
            className="object-cover object-[35%_45%]"
          />
          <div className="band-parchment bg-background text-foreground absolute inset-x-0 bottom-0 p-6 sm:inset-x-auto sm:right-8 sm:bottom-8 sm:max-w-[600px] sm:rounded-xl sm:p-12">
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
      <section aria-labelledby="how-title" className="screen">
        <div className="wrap flex flex-col justify-center">
          <h2 id="how-title" className="text-h2 max-w-[18ch]">
            From link to harbour in three steps
          </h2>
          <ol className="grid-12 mt-10 md:mt-14">
            <li className="border-border bg-card col-span-12 rounded-2xl border p-6 md:col-span-4 md:p-8">
              <span className="text-primary font-mono text-sm">01</span>
              <h3 className="text-h3 mt-4 font-medium md:mt-6">Paste the link</h3>
              <p className="text-muted-foreground mt-3">
                Any public clip or video. No sign-up or upload: the URL and a title are enough.
              </p>
              <ul className="mt-6 flex flex-wrap gap-2 md:mt-8" aria-label="Supported platforms">
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
            <li className="border-border bg-card col-span-12 rounded-2xl border p-6 md:col-span-4 md:p-8">
              <span className="text-primary font-mono text-sm">02</span>
              <h3 className="text-h3 mt-4 font-medium md:mt-6">A mod gives it a look</h3>
              <p className="text-muted-foreground mt-3">
                Every anonymous clip goes through the review queue first, which keeps spam and
                stolen clips out. Signed-in creators with a track record skip the wait.
              </p>
            </li>
            <li className="border-border bg-card col-span-12 rounded-2xl border p-6 md:col-span-4 md:p-8">
              <span className="text-primary font-mono text-sm">03</span>
              <h3 className="text-h3 mt-4 font-medium md:mt-6">It finds its section</h3>
              <p className="text-muted-foreground mt-3">
                Approved clips go live straight away. Votes push the strongest into This week, and
                from there into Best of.
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* Statement moment, beside one painting */}
      <section aria-labelledby="why-title" className="screen" data-moment="word-highlight">
        <div className="wrap grid-12 content-center items-start">
          <div className="col-span-12 md:col-span-7">
            <h2 id="why-title" className="sr-only">
              Why Plunderclips
            </h2>
            <WordHighlight
              parts={[
                "Every crew has that one clip: the last-second kraken dodge, the sloop that stole a reaper chest.",
                { strong: "Plunderclips" },
                "gives it a harbour and puts the streamer who caught it in front of new crewmates.",
              ]}
            />
          </div>
          <div className="relative col-span-12 mt-8 aspect-[4/5] overflow-hidden rounded-2xl md:col-span-5 md:mt-0 md:aspect-auto md:h-[min(70svh,640px)]">
            <Image
              src={stormySea}
              alt="A sailing ship heeling over in dark, stormy seas"
              fill
              placeholder="blur"
              sizes="(min-width: 768px) 40vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Sections */}
      <section aria-labelledby="sections-title" className="screen">
        <div className="wrap flex flex-col justify-center">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <h2 id="sections-title" className="text-h2 max-w-[16ch]">
              Three ways to watch the sea
            </h2>
            <Link
              href="/clips"
              className="link-draw inline-flex min-h-11 items-center gap-2 self-start text-lg md:self-auto"
            >
              Browse all clips <ArrowRight className="size-5" />
            </Link>
          </div>
          <ul className="grid-12 mt-10 md:mt-14">
            {sections.map((s) => (
              <li key={s.href} className="col-span-12 md:col-span-4">
                <Link
                  href={s.href}
                  className="lift group border-border bg-card block overflow-hidden rounded-2xl border md:h-full"
                >
                  <div className="zoom-frame relative aspect-[21/9] md:aspect-[16/10]">
                    <Image
                      src={s.art}
                      alt={s.alt}
                      fill
                      placeholder="blur"
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="p-5 md:p-8">
                    <h3 className="text-h3 flex items-center justify-between gap-3 font-medium">
                      {s.title}
                      <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
                    </h3>
                    <p className="text-muted-foreground mt-2 md:mt-3">{s.body}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Creators: parchment band */}
      <section
        aria-labelledby="creators-title"
        className="band-parchment screen bg-background text-foreground"
      >
        <div className="wrap grid-12 content-center items-start">
          <div className="col-span-12 md:col-span-7">
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
          <ul
            className="col-span-12 mt-10 grid grid-cols-2 gap-3 md:col-span-5 md:mt-0 md:gap-6"
            aria-label="Sign-in options"
          >
            {signIns.map(([id, name]) => (
              <li
                key={id}
                className="flex aspect-[4/3] flex-col justify-between rounded-2xl bg-[#2b2216] p-5 text-[#e4e2da] md:p-6"
              >
                <PlatformIcon platform={id} className="size-8 md:size-10" />
                <span className="text-lg font-medium">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
