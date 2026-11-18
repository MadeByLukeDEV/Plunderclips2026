import Link from "next/link";
import { connection } from "next/server";
import { liveCreators, liveForChannels, type LiveStream } from "@plunderclips/creators";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { Avatar } from "@/components/creators/avatar";

const viewers = (n: number) => `${n.toLocaleString("en-GB")} ${n === 1 ? "viewer" : "viewers"}`;
const label = { twitch: "Twitch", kick: "Kick" } as const;

/** The pulsing dot, at rest under reduced motion. */
function Dot() {
  return (
    <span aria-hidden className="relative flex size-2.5">
      <span className="bg-destructive absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none" />
      <span className="bg-destructive relative inline-flex size-2.5 rounded-full" />
    </span>
  );
}

/** "Live on Twitch" for a creator page, per request (the page itself is cached). */
export async function LiveBadges({
  channels,
}: {
  channels: { platform: string; handle: string }[];
}) {
  await connection();
  const streams = await liveForChannels(channels);
  if (!streams.length) return null;
  return (
    <ul className="mt-4 grid gap-2" aria-label="Live now">
      {streams.map((s) => (
        <li key={`${s.platform}:${s.handle}`}>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border bg-card hover:border-headline inline-flex min-h-11 max-w-full items-center gap-3 rounded-full border px-4 text-sm transition-colors"
          >
            <Dot />
            <span className="font-medium">Live on {label[s.platform]}</span>
            <span className="text-muted-foreground truncate">
              {s.title || s.game} · {viewers(s.viewers)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function LiveCard({ c }: { c: Awaited<ReturnType<typeof liveCreators>>[number] }) {
  const s: LiveStream = c.stream;
  return (
    <li className="lift bg-card border-border relative grid gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <Avatar name={c.displayName} image={c.image} className="size-10 text-[40px]" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/c/${c.handle}`}
            className="block truncate font-medium after:absolute after:inset-0"
          >
            {c.displayName}
          </Link>
          <p className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
            <Dot /> {viewers(s.viewers)}
          </p>
        </div>
        <PlatformIcon platform={s.platform} className="size-5" title={label[s.platform]} />
      </div>
      <p className="line-clamp-2 text-sm">{s.title || s.game}</p>
      <a
        href={s.url}
        target="_blank"
        rel="noopener noreferrer"
        className="link-draw text-headline relative z-10 justify-self-start text-sm font-medium"
      >
        Watch on {label[s.platform]}
      </a>
    </li>
  );
}

/**
 * Creators streaming right now, biggest first; nothing at all when nobody is live. On the home
 * page only Sea of Thieves streams count.
 */
export async function LiveNow({
  sotOnly = false,
  title,
  bare = false,
}: {
  sotOnly?: boolean;
  title: string;
  /** Inside a page's own .wrap: no section or wrap of its own. */
  bare?: boolean;
}) {
  await connection();
  const live = await liveCreators({ sotOnly, limit: 6 });
  if (!live.length) return null;
  const body = (
    <>
      <h2
        id="live-now"
        className="text-muted-foreground flex items-center gap-3 font-mono text-xs font-normal tracking-wider"
      >
        <Dot /> {title}
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {live.map((c) => (
          <LiveCard key={c.userId} c={c} />
        ))}
      </ul>
    </>
  );
  if (bare)
    return (
      <section aria-labelledby="live-now" className="mt-10">
        {body}
      </section>
    );
  return (
    <section aria-labelledby="live-now" className="pt-16">
      <div className="wrap">{body}</div>
    </section>
  );
}
