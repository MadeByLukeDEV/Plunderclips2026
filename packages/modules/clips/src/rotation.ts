import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import type { Platform } from "./parse";
import { isoWeek, weekStart } from "./week";

const { clip, section, clipSection, sectionExclusion, clipStatDaily } = schema;

/** How many clips a week's section holds. */
export const WEEKLY_SIZE = 12;

/**
 * Fills each weekly section for the current ISO week with the top clips approved that week (most
 * votes, then most views, then newest). Mod picks (rows with a person behind them) stay where
 * they are; the rotation only owns its own rows and fills the slots that are left. Clips a mod
 * removed from that week are never brought back. Past weeks are left alone, so a finished week's
 * list stays as it was on Sunday night. Run by the worker every hour.
 */
export async function rotateWeekly(
  now = new Date(),
): Promise<{ sections: number; picked: number }> {
  const period = isoWeek(now);
  const start = weekStart(period)!;
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const weekly = await db()
    .select({ slug: section.slug })
    .from(section)
    .where(eq(section.kind, "weekly"));

  let picked = 0;
  for (const { slug } of weekly) {
    picked += await db().transaction(async (tx) => {
      // One rotation per section at a time (two workers, or a slow run overlapping the next).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`weekly:${slug}`}))`);
      const manual = await tx
        .select({ clipId: clipSection.clipId, position: clipSection.position })
        .from(clipSection)
        .where(
          and(
            eq(clipSection.sectionSlug, slug),
            eq(clipSection.period, period),
            isNotNull(clipSection.addedByUserId),
          ),
        );
      const excluded = await tx
        .select({ clipId: sectionExclusion.clipId })
        .from(sectionExclusion)
        .where(and(eq(sectionExclusion.sectionSlug, slug), eq(sectionExclusion.period, period)));
      const skip = [...manual.map((m) => m.clipId), ...excluded.map((e) => e.clipId)];
      const room = Math.max(0, WEEKLY_SIZE - manual.length);

      const top = room
        ? await tx
            .select({ id: clip.id })
            .from(clip)
            .where(
              and(
                eq(clip.status, "approved"),
                gte(clip.approvedAt, start),
                lt(clip.approvedAt, end),
                skip.length ? notInArray(clip.id, skip) : undefined,
              ),
            )
            .orderBy(
              desc(clip.voteCount),
              desc(clip.viewCount),
              desc(clip.approvedAt),
              desc(clip.id),
            )
            .limit(room)
        : [];

      await tx
        .delete(clipSection)
        .where(
          and(
            eq(clipSection.sectionSlug, slug),
            eq(clipSection.period, period),
            isNull(clipSection.addedByUserId),
          ),
        );
      const after = manual.reduce((m, r) => Math.max(m, r.position), -1) + 1;
      if (top.length)
        await tx
          .insert(clipSection)
          .values(
            top.map((c, i) => ({ clipId: c.id, sectionSlug: slug, period, position: after + i })),
          )
          .onConflictDoNothing();
      return top.length;
    });
  }
  return { sections: weekly.length, picked };
}

/** Remembers that a mod took a clip out of a section's week, so the rotation leaves it out. */
export async function excludeFromWeek(
  tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0] | ReturnType<typeof db>,
  slug: string,
  period: string,
  clipIds: string[],
  userId: string | null,
): Promise<void> {
  if (!clipIds.length || !period) return;
  await tx
    .insert(sectionExclusion)
    .values(
      clipIds.map((clipId) => ({ sectionSlug: slug, period, clipId, excludedByUserId: userId })),
    )
    .onConflictDoNothing();
}

// --- Daily stats ----------------------------------------------------------------------------

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Writes every published clip's current view and vote totals as today's (UTC) row, replacing an
 * earlier one from today, so each day ends with its last snapshot. Rows older than 400 days go.
 * Run by the worker every hour.
 */
export async function snapshotClipStats(now = new Date()): Promise<number> {
  const day = utcDay(now);
  const res = await db().execute(sql`
    insert into ${clipStatDaily} (clip_id, day, views, votes)
    select ${clip.id}, ${day}::date, ${clip.viewCount}, ${clip.voteCount}
    from ${clip} where ${clip.status} = 'approved'
    on conflict (clip_id, day) do update set views = excluded.views, votes = excluded.votes
  `);
  await db()
    .delete(clipStatDaily)
    .where(lt(clipStatDaily.day, utcDay(new Date(now.getTime() - 400 * 86_400_000))));
  return (res as unknown as { count?: number }).count ?? 0;
}

// --- Analytics for a creator ------------------------------------------------------------------

export type ChannelMatch = { platform: Platform; handle: string; authorUrls: string[] };

/** The same "this clip is from this channel" rule the creator page uses. */
function matchChannels(channels: ChannelMatch[]) {
  return or(
    ...channels.map((c) =>
      and(
        eq(clip.platform, c.platform),
        or(
          sql`lower(${clip.channel}) = ${c.handle.toLowerCase()}`,
          c.authorUrls.length
            ? inArray(
                sql`lower(rtrim(${clip.authorUrl}, '/'))`,
                c.authorUrls.map((u) => u.toLowerCase()),
              )
            : undefined,
        ),
      ),
    ),
  )!;
}

export type ClipAnalytics = {
  totals: { clips: number; views: number; votes: number };
  /** Views and votes gained per day (UTC), oldest first, `days` long. Missing days are 0. */
  daily: { day: string; views: number; votes: number }[];
  top: { id: string; title: string; views: number; votes: number; approvedAt: Date | null }[];
  /** How often their clips were picked, per section. */
  sections: { slug: string; title: string; picks: number }[];
};

/** Numbers for a creator's dashboard: their published clips, by the channels on their page. */
export async function clipAnalytics(
  channels: ChannelMatch[],
  days = 30,
  now = new Date(),
): Promise<ClipAnalytics> {
  const empty: ClipAnalytics = {
    totals: { clips: 0, views: 0, votes: 0 },
    daily: [],
    top: [],
    sections: [],
  };
  const span = Math.min(Math.max(days, 7), 90);
  const dayList = Array.from({ length: span }, (_, i) =>
    utcDay(new Date(now.getTime() - (span - 1 - i) * 86_400_000)),
  );
  if (!channels.length)
    return { ...empty, daily: dayList.map((day) => ({ day, views: 0, votes: 0 })) };
  const mine = and(eq(clip.status, "approved"), matchChannels(channels));

  const [totals] = await db()
    .select({
      clips: sql<number>`count(*)::int`,
      views: sql<number>`coalesce(sum(${clip.viewCount}), 0)::int`,
      votes: sql<number>`coalesce(sum(${clip.voteCount}), 0)::int`,
    })
    .from(clip)
    .where(mine);

  const top = await db()
    .select({
      id: clip.id,
      title: clip.title,
      views: clip.viewCount,
      votes: clip.voteCount,
      approvedAt: clip.approvedAt,
    })
    .from(clip)
    .where(mine)
    .orderBy(desc(clip.viewCount), desc(clip.voteCount))
    .limit(10);

  // Daily gains: each day's snapshot minus the one before. A clip's first snapshot is only a
  // baseline, unless the clip was approved that day (then its first views are that day's gain);
  // so the day snapshots start doesn't show every clip's lifetime views as one spike.
  const since = utcDay(new Date(now.getTime() - span * 86_400_000));
  const rows = await db()
    .select({
      clipId: clipStatDaily.clipId,
      day: clipStatDaily.day,
      views: clipStatDaily.views,
      votes: clipStatDaily.votes,
      approvedAt: clip.approvedAt,
    })
    .from(clipStatDaily)
    .innerJoin(clip, eq(clip.id, clipStatDaily.clipId))
    .where(and(mine, gte(clipStatDaily.day, since)))
    .orderBy(clipStatDaily.clipId, clipStatDaily.day);
  const gains = new Map<string, { views: number; votes: number }>();
  let prev: (typeof rows)[number] | null = null;
  for (const r of rows) {
    const base = prev && prev.clipId === r.clipId ? prev : null;
    const newThatDay = !base && r.approvedAt !== null && utcDay(r.approvedAt) === r.day;
    if (base || newThatDay) {
      const g = gains.get(r.day) ?? { views: 0, votes: 0 };
      g.views += Math.max(0, r.views - (base?.views ?? 0));
      g.votes += Math.max(0, r.votes - (base?.votes ?? 0));
      gains.set(r.day, g);
    }
    prev = r;
  }

  const sections = await db()
    .select({ slug: section.slug, title: section.title, picks: sql<number>`count(*)::int` })
    .from(clipSection)
    .innerJoin(clip, eq(clip.id, clipSection.clipId))
    .innerJoin(section, eq(section.slug, clipSection.sectionSlug))
    .where(mine)
    .groupBy(section.slug, section.title, section.sortOrder)
    .orderBy(section.sortOrder);

  return {
    totals: totals ?? empty.totals,
    daily: dayList.map((day) => ({ day, ...(gains.get(day) ?? { views: 0, votes: 0 }) })),
    top,
    sections,
  };
}
