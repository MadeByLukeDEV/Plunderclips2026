import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  embedUrl,
  getClip,
  getSectionPage,
  listClips,
  relatedClips,
  sectionsOf,
  type ClipSort,
  type ClipView,
} from "@plunderclips/clips";

/**
 * Cached reads for the public clip pages. Everything carries the "clips" tag, which the submit
 * action (and later the review queue) expires with updateTag("clips") when a clip is published.
 */
export async function clipsPage(cursor: string | null, tag: string | null, sort: ClipSort) {
  "use cache";
  cacheTag("clips");
  cacheLife("minutes");
  return listClips({ cursor, tag, sort });
}

export async function sectionPage(slug: string) {
  "use cache";
  cacheTag("clips", `section:${slug}`);
  cacheLife("minutes");
  return getSectionPage(slug);
}

export async function clipPage(id: string) {
  "use cache";
  cacheTag("clips", `clip:${id}`);
  cacheLife("hours");
  const clip = await getClip(id);
  if (!clip) return null;
  const [related, sections] = await Promise.all([relatedClips(clip), sectionsOf(clip.id)]);
  return { clip, related, sections };
}

/** Hosts the site runs on, for Twitch's `parent` check. */
function parents(): string[] {
  const hosts = new Set(["localhost"]);
  try {
    if (process.env.BETTER_AUTH_URL) hosts.add(new URL(process.env.BETTER_AUTH_URL).hostname);
  } catch {}
  return [...hosts];
}

/** iframe src to load after the visitor presses play, or null for a link-out (X, missing player). */
export function playerSrc(c: ClipView): string | null {
  if (c.embedSrc) return c.embedSrc;
  return embedUrl(
    {
      platform: c.platform,
      kind: c.kind,
      id: c.platformId,
      startSeconds: c.startSeconds ?? undefined,
    },
    { parents: parents(), autoplay: true },
  );
}
