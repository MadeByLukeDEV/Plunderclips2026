import Link from "next/link";
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
    label: "Ivan Aivazovsky, Ship in the Stormy Sea",
    href: "https://commons.wikimedia.org/wiki/File:Ivan_Aivazovsky_-_Ship_in_the_Stormy_Sea.jpg",
  },
];

const community = [...mainLinks, { href: "/submit", label: "Submit a clip" }];

export function SiteFooter() {
  return (
    <footer className="border-border border-t bg-[#1e1810]">
      <div className="wrap grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <Wordmark />
          <p className="text-muted-foreground mt-4">
            A clip harbour for Sea of Thieves streamers. Share the moment, get found, find a crew.
          </p>
          <div className="mt-6 flex gap-4">
            <PlatformIcon platform="twitch" title="Twitch" />
            <PlatformIcon platform="youtube" title="YouTube" />
            <PlatformIcon platform="kick" title="Kick" />
            <PlatformIcon platform="discord" title="Discord" />
          </div>
        </div>
        <nav aria-label="Clips">
          <h2 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
            Clips
          </h2>
          <ul className="mt-4 grid gap-1">
            {clipSections.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="link-draw inline-flex min-h-11 items-center">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Community">
          <h2 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
            Community
          </h2>
          <ul className="mt-4 grid gap-1">
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
      <div className="wrap border-border text-muted-foreground border-t py-6 text-sm">
        <p>
          Unofficial fan project, not affiliated with Rare Ltd. or Microsoft. Sea of Thieves is a
          trademark of its owners.
        </p>
        <p className="mt-2">
          Paintings in the public domain, via Wikimedia Commons:{" "}
          {credits.map((c, i) => (
            <span key={c.href}>
              <a href={c.href} className="link-draw" rel="noopener noreferrer" target="_blank">
                {c.label}
              </a>
              {i < credits.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}
