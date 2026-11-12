import { and, asc, count, desc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { isClipTag, isoWeek, type ClipTag } from "@plunderclips/clips";
import { assertCan, type Actor } from "./actor";
import { audit } from "./audit";

const { clip, clipSection, section, user } = schema;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REJECT_REASONS = {
  not_sot: "Not Sea of Thieves gameplay",
  reupload: "A re-upload: link the original clip",
  low_quality: "Too short or hard to follow",
  duplicate: "Already in the library under another link",
  rules: "Breaks the community rules",
} as const;
export type RejectReason = keyof typeof REJECT_REASONS;

export type QueueClip = {
  id: string;
  platform: (typeof clip.$inferSelect)["platform"];
  kind: (typeof clip.$inferSelect)["kind"];
  platformId: string;
  canonicalUrl: string;
  embedSrc: string | null;
  startSeconds: number | null;
  title: string;
  thumbnailUrl: string | null;
  authorName: string | null;
  authorUrl: string | null;
  durationSeconds: number | null;
  game: string | null;
  isSeaOfThieves: boolean | null;
  tags: ClipTag[];
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  submitterNote: string | null;
  submitterName: string | null;
  /** First 8 chars of the salted IP hash, enough to spot one source sending a lot. */
  submitterTag: string | null;
  /** Earlier submissions from the same account or IP hash, and how many got approved. */
  history: { total: number; approved: number };
  sections: { slug: string; period: string }[];
  voteCount: number;
  createdAt: Date;
  approvedAt: Date | null;
};

export type QueueStatus = "pending" | "approved" | "rejected";

const PAGE = 20;

/** Pending clips oldest first (first in, first reviewed); published or rejected newest first. */
export async function listQueue(
  actor: Actor,
  opts: { status?: QueueStatus; cursor?: string | null } = {},
): Promise<{ clips: QueueClip[]; nextCursor: string | null }> {
  assertCan(actor, { clip: ["review"] }, "review clips");
  const status = opts.status ?? "pending";
  const oldestFirst = status === "pending";
  const c = decode(opts.cursor);
  const where = [eq(clip.status, status)];
  if (c)
    where.push(
      oldestFirst
        ? or(
            sql`${clip.createdAt} > ${c.at}`,
            and(eq(clip.createdAt, c.at), sql`${clip.id} > ${c.id}`),
          )!
        : or(lt(clip.createdAt, c.at), and(eq(clip.createdAt, c.at), lt(clip.id, c.id)))!,
    );

  const rows = await db()
    .select({
      id: clip.id,
      platform: clip.platform,
      kind: clip.kind,
      platformId: clip.platformId,
      canonicalUrl: clip.canonicalUrl,
      embedSrc: clip.embedSrc,
      startSeconds: clip.startSeconds,
      title: clip.title,
      thumbnailUrl: clip.thumbnailUrl,
      authorName: clip.authorName,
      authorUrl: clip.authorUrl,
      durationSeconds: clip.durationSeconds,
      game: clip.game,
      isSeaOfThieves: clip.isSeaOfThieves,
      tags: clip.tags,
      status: clip.status,
      rejectReason: clip.rejectReason,
      submitterNote: clip.submitterNote,
      submittedByUserId: clip.submittedByUserId,
      submitterIpHash: clip.submitterIpHash,
      submitterName: user.name,
      voteCount: clip.voteCount,
      createdAt: clip.createdAt,
      approvedAt: clip.approvedAt,
    })
    .from(clip)
    .leftJoin(user, eq(user.id, clip.submittedByUserId))
    .where(and(...where))
    .orderBy(
      ...(oldestFirst
        ? [asc(clip.createdAt), asc(clip.id)]
        : [desc(clip.createdAt), desc(clip.id)]),
    )
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);

  const ids = page.map((r) => r.id);
  const picks = ids.length
    ? await db()
        .select({
          clipId: clipSection.clipId,
          slug: clipSection.sectionSlug,
          period: clipSection.period,
        })
        .from(clipSection)
        .where(inArray(clipSection.clipId, ids))
    : [];

  const history = await submitterHistory(page);
  const last = page.at(-1);
  return {
    // The full IP hash and the submitter's id stay on the server; staff see an 8-char tag.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
    clips: page.map(({ submitterIpHash, submittedByUserId, ...r }) => ({
      ...r,
      tags: r.tags.filter(isClipTag),
      submitterTag: submitterIpHash ? submitterIpHash.slice(0, 8) : null,
      history: history.get(r.id) ?? { total: 0, approved: 0 },
      sections: picks
        .filter((p) => p.clipId === r.id)
        .map(({ slug, period }) => ({ slug, period })),
    })),
    nextCursor:
      rows.length > PAGE && last
        ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString("base64url")
        : null,
  };
}

/** Per clip: the submitter's other clips (same account, else same IP hash). */
async function submitterHistory(
  rows: { id: string; submittedByUserId: string | null; submitterIpHash: string | null }[],
): Promise<Map<string, { total: number; approved: number }>> {
  const out = new Map<string, { total: number; approved: number }>();
  for (const r of rows) {
    const who = r.submittedByUserId
      ? eq(clip.submittedByUserId, r.submittedByUserId)
      : r.submitterIpHash
        ? eq(clip.submitterIpHash, r.submitterIpHash)
        : null;
    if (!who) continue;
    const [row] = await db()
      .select({
        total: count(),
        approved: sql<number>`count(*) filter (where ${clip.status} = 'approved')`,
      })
      .from(clip)
      .where(and(who, ne(clip.id, r.id)));
    out.set(r.id, { total: Number(row?.total ?? 0), approved: Number(row?.approved ?? 0) });
  }
  return out;
}

export async function queueCounts(): Promise<Record<QueueStatus, number>> {
  const rows = await db()
    .select({ status: clip.status, n: count() })
    .from(clip)
    .groupBy(clip.status);
  const out: Record<QueueStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

// --- Decisions -------------------------------------------------------------------

export type SectionPick = { slug: string; period?: string };

export type ReviewInput =
  | { decision: "approve"; tags?: string[]; sections?: SectionPick[] }
  | { decision: "reject"; reason: RejectReason | "custom"; note?: string }
  /** Change tags and picks on an already published clip. */
  | { decision: "update"; tags?: string[]; sections?: SectionPick[] }
  /** Take a published clip down again (e.g. after a report). */
  | { decision: "unpublish"; reason: RejectReason | "custom"; note?: string };

export type ReviewResult =
  | { ok: true; status: QueueStatus }
  | { ok: false; error: "not_found" | "wrong_status" | "bad_input" };

/**
 * Applies a mod decision. Status, tags and section picks change in one transaction, together with
 * the audit entry, so the log always matches what happened.
 */
export async function reviewClip(
  actor: Actor,
  clipId: string,
  input: ReviewInput,
): Promise<ReviewResult> {
  assertCan(actor, { clip: ["review"] }, "review clips");
  if (!UUID.test(clipId)) return { ok: false, error: "not_found" };

  const tags =
    "tags" in input && input.tags ? [...new Set(input.tags.filter(isClipTag))] : undefined;
  const picks = "sections" in input && input.sections ? input.sections : undefined;
  if (picks?.length) assertCan(actor, { clip: ["feature"] }, "pick clips for sections");

  let reason: string | null = null;
  if (input.decision === "reject" || input.decision === "unpublish") {
    reason =
      input.reason === "custom"
        ? (input.note?.trim().slice(0, 280) ?? "")
        : `${REJECT_REASONS[input.reason]}${input.note?.trim() ? `. ${input.note.trim().slice(0, 200)}` : ""}`;
    if (!reason || !(input.reason === "custom" || input.reason in REJECT_REASONS))
      return { ok: false, error: "bad_input" };
  }

  return db().transaction(async (tx) => {
    const [current] = await tx
      .select({ status: clip.status, tags: clip.tags })
      .from(clip)
      .where(eq(clip.id, clipId))
      .for("update");
    if (!current) return { ok: false as const, error: "not_found" as const };

    const need: Record<ReviewInput["decision"], QueueStatus[]> = {
      approve: ["pending", "rejected"],
      reject: ["pending"],
      update: ["approved"],
      unpublish: ["approved"],
    };
    if (!need[input.decision].includes(current.status))
      return { ok: false as const, error: "wrong_status" as const };

    const now = new Date();
    const next: QueueStatus =
      input.decision === "approve" || input.decision === "update" ? "approved" : "rejected";

    await tx
      .update(clip)
      .set({
        status: next,
        reviewedByUserId: actor.id,
        reviewedAt: now,
        ...(input.decision === "approve" ? { approvedAt: now, rejectReason: null } : {}),
        ...(reason !== null ? { rejectReason: reason } : {}),
        ...(tags ? { tags } : {}),
      })
      .where(eq(clip.id, clipId));

    if (picks) {
      const valid = await tx
        .select({ slug: section.slug, kind: section.kind })
        .from(section)
        .where(inArray(section.slug, picks.map((p) => p.slug).concat("")));
      const rows = picks.flatMap((p) => {
        const s = valid.find((v) => v.slug === p.slug);
        if (!s) return [];
        const period =
          s.kind === "weekly"
            ? p.period && /^\d{4}-W\d{2}$/.test(p.period)
              ? p.period
              : isoWeek(now)
            : "";
        return [{ clipId, sectionSlug: s.slug, period, addedByUserId: actor.id }];
      });
      // Picks are replaced: unticking a section removes the clip from it.
      await tx.delete(clipSection).where(eq(clipSection.clipId, clipId));
      if (rows.length) await tx.insert(clipSection).values(rows).onConflictDoNothing();
    }
    if (next === "rejected") await tx.delete(clipSection).where(eq(clipSection.clipId, clipId));

    await audit(
      actor.id,
      {
        action: `clip.${input.decision}`,
        targetType: "clip",
        targetId: clipId,
        meta: {
          from: current.status,
          to: next,
          ...(reason ? { reason } : {}),
          ...(tags ? { tags } : {}),
          ...(picks ? { sections: picks.map((p) => p.slug) } : {}),
        },
      },
      tx,
    );
    return { ok: true as const, status: next };
  });
}

// --- Section curation ------------------------------------------------------------------

export type SectionPickRow = {
  clipId: string;
  title: string;
  thumbnailUrl: string | null;
  platform: QueueClip["platform"];
  position: number;
  period: string;
};

export async function listSectionPicks(
  actor: Actor,
  slug: string,
  period = "",
): Promise<SectionPickRow[]> {
  assertCan(actor, { clip: ["feature"] }, "curate sections");
  return db()
    .select({
      clipId: clip.id,
      title: clip.title,
      thumbnailUrl: clip.thumbnailUrl,
      platform: clip.platform,
      position: clipSection.position,
      period: clipSection.period,
    })
    .from(clipSection)
    .innerJoin(clip, eq(clip.id, clipSection.clipId))
    .where(and(eq(clipSection.sectionSlug, slug), eq(clipSection.period, period)))
    .orderBy(asc(clipSection.position), desc(clipSection.addedAt));
}

/** Rewrites the order of a section's picks (positions 0..n-1) and/or removes some. */
export async function arrangeSection(
  actor: Actor,
  slug: string,
  period: string,
  order: string[],
): Promise<void> {
  assertCan(actor, { clip: ["feature"] }, "curate sections");
  await db().transaction(async (tx) => {
    const current = await tx
      .select({ clipId: clipSection.clipId })
      .from(clipSection)
      .where(and(eq(clipSection.sectionSlug, slug), eq(clipSection.period, period)));
    const keep = order.filter((id) => current.some((c) => c.clipId === id));
    const removed = current.map((c) => c.clipId).filter((id) => !keep.includes(id));
    if (removed.length)
      await tx
        .delete(clipSection)
        .where(
          and(
            eq(clipSection.sectionSlug, slug),
            eq(clipSection.period, period),
            inArray(clipSection.clipId, removed),
          ),
        );
    for (const [i, id] of keep.entries())
      await tx
        .update(clipSection)
        .set({ position: i })
        .where(
          and(
            eq(clipSection.sectionSlug, slug),
            eq(clipSection.period, period),
            eq(clipSection.clipId, id),
          ),
        );
    await audit(
      actor.id,
      {
        action: "section.arrange",
        targetType: "section",
        targetId: slug,
        meta: { period, order: keep, removed },
      },
      tx,
    );
  });
}

function decode(v: string | null | undefined): { at: Date; id: string } | null {
  if (!v || v.length > 200) return null;
  const [iso, id] = Buffer.from(v, "base64url").toString("utf8").split("|");
  const at = iso ? new Date(iso) : null;
  return at && !Number.isNaN(at.getTime()) && id && UUID.test(id) ? { at, id } : null;
}
