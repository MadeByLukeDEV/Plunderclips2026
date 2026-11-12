import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { clipSections, mainLinks } from "./nav-data";
import { Wordmark } from "./wordmark";

const credits = [
  {
    label: "J. M. W. Turner, Fishermen at Sea",
    href: "https://commons.wikimedia.org/wiki/File:Joseph_Mallord_William_Turner_-_Fishermen_at_Sea_-_Google_Art_Project.jpg",
  },
  {
    label: "Ivan Aivazovsky, The Ninth Wave",
    href: "https://commons.wikimedia.org/wiki/File:Hovhannes_Aivazovsky_-_The_Ninth_Wave_-_Google_Art_Project.jpg",
  },
  {
    label: "J. M. W. Turner, The Fighting Temeraire",
    href: "https://commons.wikimedia.org/wiki/File:Turner,_J._M._W._-_The_Fighting_T%C3%A9m%C3%A9raire_tugged_to_her_last_Berth_to_be_broken.jpg",
  },
  {
    label: "Ivan Aivazovsky, A Moonlit Night at Sea",
    href: "https://commons.wikimedia.org/wiki/File:Ivan_Konstantinovich_Aivazovsky_-_A_Moonlit_Night_at_Sea,_1885.jpg",
  },
  {
    label: "Ivan Aivazovsky, Ship in the Stormy Sea",
    href: "https://commons.wikimedia.org/wiki/File:Ivan_Aivazovsky_-_Ship_in_the_Stormy_Sea.jpg",
  },
];

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
    <footer
      className="closing screen border-border border-t bg-[#1e1810]"
      aria-labelledby="close-title"
    >
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
                  <Check className="text-primary mt-1 size-5 shrink-0" />
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

          <div className="text-muted-foreground mt-10 text-sm">
            <p>
              Unofficial fan project, not affiliated with Rare Ltd. or Microsoft. Sea of Thieves is
              a trademark of its owners. Paintings in the public domain, via Wikimedia Commons:
            </p>
            <ul className="flex flex-wrap gap-x-6">
              {credits.map((c) => (
                <li key={c.href}>
                  <a
                    href={c.href}
                    className="link-draw inline-flex min-h-11 items-center"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
