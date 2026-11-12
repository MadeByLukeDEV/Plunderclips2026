import { and, arrayOverlaps, asc, desc, eq, gte, lt, ne, notInArray, or } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import type { Platform } from "./parse";
import { isClipTag, type ClipTag } from "./tags";
import { isoWeek, previousWeek } from "./week";

const { clip, section, clipSection } = schema;

/** What the public pages may see of a clip. No submitter, IP hash or note. */
export type ClipView = {
  id: string;
  platform: Platform;
  kind: "clip" | "video" | "short" | "live" | "post";
  platformId: string;
  channel: string | null;
  canonicalUrl: string;
  embedSrc: string | null;
  startSeconds: number | null;
  title: string;
  thumbnailUrl: string | null;
  authorName: string | null;
  authorUrl: string | null;
  durationSeconds: number | null;
  tags: ClipTag[];
  approvedAt: Date | null;
};

export type SectionView = {
  slug: string;
  title: string;
  blurb: string;
  kind: "weekly" | "curated";
};

const columns = {
  id: clip.id,
  platform: clip.platform,
  kind: clip.kind,
  platformId: clip.platformId,
  channel: clip.channel,
  canonicalUrl: clip.canonicalUrl,
  embedSrc: clip.embedSrc,
  startSeconds: clip.startSeconds,
  title: clip.title,
  thumbnailUrl: clip.thumbnailUrl,
  authorName: clip.authorName,
  authorUrl: clip.authorUrl,
  durationSeconds: clip.durationSeconds,
  tags: clip.tags,
  approvedAt: clip.approvedAt,
};

const toView = (r: { tags: string[] } & Omit<ClipView, "tags">): ClipView => ({
  ...r,
  tags: r.tags.filter(isClipTag),
});

const approved = eq(clip.status, "approved");
const newest = [desc(clip.approvedAt), desc(clip.id)] as const;

export const PAGE_SIZE = 24;

// --- Cursor: "<approvedAt ISO>|<id>", base64url -----------------------------

export function encodeCursor(c: Pick<ClipView, "approvedAt" | "id">): string | null {
  if (!c.approvedAt) return null;
  return Buffer.from(`${c.approvedAt.toISOString()}|${c.id}`).toString("base64url");
}

export function decodeCursor(v: string | null | undefined): { at: Date; id: string } | null {
  if (!v || v.length > 200) return null;
  const [iso, id] = Buffer.from(v, "base64url").toString("utf8").split("|");
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime()) || !id || !UUID.test(id)) return null;
  return { at, id };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Lists ------------------------------------------------------------------

export type ClipPage = { clips: ClipView[]; nextCursor: string | null };

/** Approved clips, newest first, keyset-paginated. Optional tag or channel filter. */
export async function listClips(
  opts: { cursor?: string | null; tag?: string | null; limit?: number } = {},
): Promise<ClipPage> {
  const limit = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), 60);
  const cursor = decodeCursor(opts.cursor);
  const where = [approved];
  if (opts.tag && isClipTag(opts.tag)) where.push(arrayOverlaps(clip.tags, [opts.tag]));
  if (cursor)
    where.push(
      or(
        lt(clip.approvedAt, cursor.at),
        and(eq(clip.approvedAt, cursor.at), lt(clip.id, cursor.id)),
      )!,
    );
  const rows = await db()
    .select(columns)
    .from(clip)
    .where(and(...where))
    .orderBy(...newest)
    .limit(limit + 1);
  const clips = rows.slice(0, limit).map(toView);
  return { clips, nextCursor: rows.length > limit ? encodeCursor(clips.at(-1)!) : null };
}

export async function listSections(): Promise<SectionView[]> {
  return db()
    .select({ slug: section.slug, title: section.title, blurb: section.blurb, kind: section.kind })
    .from(section)
    .orderBy(asc(section.sortOrder));
}

export type SectionPage = {
  section: SectionView;
  clips: ClipView[];
  /** ISO week of the picks shown (weekly sections only). */
  period: string | null;
  /** No picks yet: the newest approved clips of the last 7 days stand in. */
  fallback: boolean;
};

/**
 * A section with its clips. Weekly sections show this week's picks, else last week's,
 * else the newest approved clips of the last seven days so the page is never empty.
 */
export async function getSectionPage(slug: string, now = new Date()): Promise<SectionPage | null> {
  const [s] = await db()
    .select({ slug: section.slug, title: section.title, blurb: section.blurb, kind: section.kind })
    .from(section)
    .where(eq(section.slug, slug))
    .limit(1);
  if (!s) return null;

  if (s.kind === "curated")
    return { section: s, clips: await picks(slug, ""), period: null, fallback: false };

  const thisWeek = isoWeek(now);
  for (const period of [thisWeek, previousWeek(thisWeek)]) {
    if (!period) continue;
    const clips = await picks(slug, period);
    if (clips.length) return { section: s, clips, period, fallback: false };
  }
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await db()
    .select(columns)
    .from(clip)
    .where(and(approved, gte(clip.approvedAt, since)))
    .orderBy(...newest)
    .limit(PAGE_SIZE);
  return { section: s, clips: rows.map(toView), period: thisWeek, fallback: true };
}

async function picks(slug: string, period: string): Promise<ClipView[]> {
  const rows = await db()
    .select(columns)
    .from(clipSection)
    .innerJoin(clip, eq(clip.id, clipSection.clipId))
    .where(and(eq(clipSection.sectionSlug, slug), eq(clipSection.period, period), approved))
    .orderBy(asc(clipSection.position), desc(clipSection.addedAt))
    .limit(60);
  return rows.map(toView);
}

// --- One clip ---------------------------------------------------------------

/** A published clip, or null (unknown id, pending or rejected). */
export async function getClip(id: string): Promise<ClipView | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db()
    .select(columns)
    .from(clip)
    .where(and(eq(clip.id, id), approved))
    .limit(1);
  return row ? toView(row) : null;
}

/** Same channel or shared tags first, topped up with the newest clips. */
export async function relatedClips(c: ClipView, limit = 6): Promise<ClipView[]> {
  const match = [];
  if (c.channel) match.push(and(eq(clip.platform, c.platform), eq(clip.channel, c.channel))!);
  if (c.tags.length) match.push(arrayOverlaps(clip.tags, c.tags));

  const first = match.length
    ? await db()
        .select(columns)
        .from(clip)
        .where(and(approved, ne(clip.id, c.id), or(...match)))
        .orderBy(...newest)
        .limit(limit)
    : [];
  if (first.length >= limit) return first.map(toView);

  const seen = [c.id, ...first.map((r) => r.id)];
  const rest = await db()
    .select(columns)
    .from(clip)
    .where(and(approved, notInArray(clip.id, seen)))
    .orderBy(...newest)
    .limit(limit - first.length);
  return [...first, ...rest].map(toView);
}

// --- Curation (used by the admin queue in #10) ---------------------------------

export async function addToSection(
  clipId: string,
  slug: string,
  opts: { period?: string; position?: number; userId?: string | null } = {},
): Promise<void> {
  await db()
    .insert(clipSection)
    .values({
      clipId,
      sectionSlug: slug,
      period: opts.period ?? "",
      position: opts.position ?? 0,
      addedByUserId: opts.userId ?? null,
    })
    .onConflictDoUpdate({
      target: [clipSection.sectionSlug, clipSection.period, clipSection.clipId],
      set: { position: opts.position ?? 0 },
    });
}

export async function removeFromSection(clipId: string, slug: string, period = ""): Promise<void> {
  await db()
    .delete(clipSection)
    .where(
      and(
        eq(clipSection.clipId, clipId),
        eq(clipSection.sectionSlug, slug),
        eq(clipSection.period, period),
      ),
    );
}

/** Sections a clip is in, for the clip page ("Picked for This week"). */
export async function sectionsOf(clipId: string): Promise<{ slug: string; title: string }[]> {
  if (!UUID.test(clipId)) return [];
  return db()
    .selectDistinct({ slug: section.slug, title: section.title })
    .from(clipSection)
    .innerJoin(section, eq(section.slug, clipSection.sectionSlug))
    .where(eq(clipSection.clipId, clipId));
}
