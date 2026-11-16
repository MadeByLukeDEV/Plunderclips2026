import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { clipSections, mainLinks } from "./nav-data";
import { Wordmark } from "./wordmark";

const community = [...mainLinks, { href: "/submit", label: "Submit a clip" }];

const closeFacts = [
  "Public link from Twitch, YouTube, Kick or TikTok",
  "No account, no upload",
  "A mod reviews it, then it goes live",
];

const listLabel = "font-mono text-xs tracking-wider text-muted-foreground uppercase";

/**
 * The closing footer (dealt: close-type + footer-dark): one screen holding the last call to action,
 * the site links and the credits. It closes every page.
 */
export function SiteFooter() {
  return (
    <footer className="closing screen border-border bg-deep border-t" aria-labelledby="close-title">
      <div className="wrap flex flex-col justify-between gap-16">
        <div className="grid-12 items-start">
          <h2
            id="close-title"
            className="col-span-12 text-[clamp(3rem,1.4rem+6vw,7.5rem)] leading-[0.95] md:col-span-7"
          >
            Got a clip worth seeing?
          </h2>
          <div className="col-span-12 mt-8 md:col-span-5 md:mt-3">
            <ul className="text-lead grid gap-4">
              {closeFacts.map((t) => (
                <li key={t} className="flex gap-3">
                  <Check className="text-headline mt-1 size-5 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-8 w-full md:w-auto">
              <Link href="/submit">Submit a clip</Link>
            </Button>
          </div>
        </div>

        <div>
          <div className="grid-12 border-border items-start border-t pt-10">
            <div className="col-span-12 md:col-span-7">
              <Wordmark />
              <p className="text-muted-foreground mt-3 max-w-sm">
                A clip harbour for Sea of Thieves streamers. Share the moment, get found, find a
                crew.
              </p>
              <div className="mt-4 flex gap-4">
                <PlatformIcon platform="twitch" title="Twitch" />
                <PlatformIcon platform="youtube" title="YouTube" />
                <PlatformIcon platform="kick" title="Kick" />
                <PlatformIcon platform="discord" title="Discord" />
              </div>
            </div>
            <nav aria-label="Clips" className="col-span-12 mt-8 md:col-span-2 md:mt-0">
              <p className={listLabel}>Clips</p>
              <ul className="mt-2">
                {clipSections.map((s) => (
                  <li key={s.href}>
                    <Link href={s.href} className="link-draw inline-flex min-h-11 items-center">
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Community" className="col-span-12 mt-6 md:col-span-3 md:mt-0">
              <p className={listLabel}>Community</p>
              <ul className="mt-2">
                {community.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="link-draw inline-flex min-h-11 items-center">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="text-muted-foreground mt-10 grid gap-2 text-sm">
            <p>
              Artwork by{" "}
              <a
                href="https://x.com/ArteInFlames"
                className="link-draw text-foreground"
                rel="noopener noreferrer"
                target="_blank"
              >
                Namaaay (@ArteInFlames)
              </a>
              .
            </p>
            <p>
              Plunderclips is an unofficial fan project, not endorsed by or affiliated with Rare
              Ltd. or Microsoft. It uses assets from Sea of Thieves under Microsoft&apos;s{" "}
              <a
                href="https://www.xbox.com/en-US/developers/rules"
                className="link-draw"
                rel="noopener noreferrer"
                target="_blank"
              >
                Game Content Usage Rules
              </a>
              . Sea of Thieves © Microsoft Corporation.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
