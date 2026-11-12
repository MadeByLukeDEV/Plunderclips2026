import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { slidingWindow } from "@plunderclips/shared";
import { assertCan, type Actor } from "./actor";
import { audit } from "./audit";
import { reviewClip, type RejectReason } from "./review";

const { report, clip, creatorProfile, user } = schema;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REPORT_REASONS = {
  not_sot: "Not Sea of Thieves",
  stolen: "Stolen or re-uploaded clip",
  spam: "Spam or advertising",
  harassment: "Harassment or hate",
  impersonation: "Pretending to be someone else",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export type ReportTarget = "clip" | "creator";

export function isReportReason(v: unknown): v is ReportReason {
  return typeof v === "string" && Object.hasOwn(REPORT_REASONS, v);
}

export type Reporter = { userId: string } | { ipHash: string };

export type CreateReportResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; error: "not_found" | "rate_limited" | "bad_input" | "no_reporter" };

/** 10 reports an hour per reporter. */
export const REPORT_LIMIT = { limit: 10, windowSeconds: 60 * 60 } as const;

/** Anyone can report a published clip or a creator page. A second open report from the same person is a no-op. */
export async function createReport(
  reporter: Reporter | null,
  input: { targetType: ReportTarget; targetId: string; reason: string; note?: string | null },
): Promise<CreateReportResult> {
  if (!reporter) return { ok: false, error: "no_reporter" };
  if (!isReportReason(input.reason) || !["clip", "creator"].includes(input.targetType))
    return { ok: false, error: "bad_input" };
  const note = input.note?.trim().slice(0, 500) || null;
  if (input.reason === "other" && !note) return { ok: false, error: "bad_input" };

  const exists =
    input.targetType === "clip"
      ? UUID.test(input.targetId) &&
        (
          await db()
            .select({ id: clip.id })
            .from(clip)
            .where(and(eq(clip.id, input.targetId), eq(clip.status, "approved")))
            .limit(1)
        ).length > 0
      : (
          await db()
            .select({ id: creatorProfile.userId })
            .from(creatorProfile)
            .where(eq(creatorProfile.userId, input.targetId))
            .limit(1)
        ).length > 0;
  if (!exists) return { ok: false, error: "not_found" };

  const key = "userId" in reporter ? `u:${reporter.userId}` : `ip:${reporter.ipHash}`;
  const limited = await slidingWindow(
    `report:${key}`,
    REPORT_LIMIT.limit,
    REPORT_LIMIT.windowSeconds,
  );
  if (!limited.ok) return { ok: false, error: "rate_limited" };

  const inserted = await db()
    .insert(report)
    .values({
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      note,
      reporterUserId: "userId" in reporter ? reporter.userId : null,
      reporterKey: key,
    })
    .onConflictDoNothing()
    .returning({ id: report.id });
  return { ok: true, duplicate: inserted.length === 0 };
}

export type ReportGroup = {
  targetType: ReportTarget;
  targetId: string;
  /** Clip title or creator display name; null when the target is gone. */
  label: string | null;
  href: string | null;
  targetStatus: string | null;
  reports: {
    id: string;
    reason: ReportReason;
    note: string | null;
    reporterName: string | null;
    createdAt: Date;
  }[];
};

/** Open reports grouped by what they're about, the most-reported first. */
export async function listOpenReports(actor: Actor): Promise<ReportGroup[]> {
  assertCan(actor, { report: ["review"] }, "triage reports");
  const rows = await db()
    .select({
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      note: report.note,
      reporterName: user.name,
      createdAt: report.createdAt,
    })
    .from(report)
    .leftJoin(user, eq(user.id, report.reporterUserId))
    .where(eq(report.status, "open"))
    .orderBy(asc(report.createdAt))
    .limit(500);

  const groups = new Map<string, ReportGroup>();
  for (const r of rows) {
    const k = `${r.targetType}:${r.targetId}`;
    if (!groups.has(k))
      groups.set(k, {
        targetType: r.targetType,
        targetId: r.targetId,
        label: null,
        href: null,
        targetStatus: null,
        reports: [],
      });
    groups
      .get(k)!
      .reports.push({
        id: r.id,
        reason: r.reason,
        note: r.note,
        reporterName: r.reporterName,
        createdAt: r.createdAt,
      });
  }

  const clipIds = [...groups.values()]
    .filter((g) => g.targetType === "clip")
    .map((g) => g.targetId);
  const creatorIds = [...groups.values()]
    .filter((g) => g.targetType === "creator")
    .map((g) => g.targetId);
  const clips = clipIds.length
    ? await db()
        .select({ id: clip.id, title: clip.title, status: clip.status })
        .from(clip)
        .where(inArray(clip.id, clipIds))
    : [];
  const creators = creatorIds.length
    ? await db()
        .select({
          id: creatorProfile.userId,
          name: creatorProfile.displayName,
          handle: creatorProfile.handle,
          banned: user.banned,
        })
        .from(creatorProfile)
        .innerJoin(user, eq(user.id, creatorProfile.userId))
        .where(inArray(creatorProfile.userId, creatorIds))
    : [];
  for (const g of groups.values()) {
    if (g.targetType === "clip") {
      const c = clips.find((x) => x.id === g.targetId);
      if (c) Object.assign(g, { label: c.title, href: `/clip/${c.id}`, targetStatus: c.status });
    } else {
      const c = creators.find((x) => x.id === g.targetId);
      if (c)
        Object.assign(g, {
          label: c.name,
          href: `/c/${c.handle}`,
          targetStatus: c.banned ? "banned" : "active",
        });
    }
  }
  return [...groups.values()].sort((a, b) => b.reports.length - a.reports.length);
}

export async function openReportCount(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(report).where(eq(report.status, "open"));
  return Number(row?.n ?? 0);
}

export type ResolveInput =
  | { action: "dismiss"; note?: string }
  /** Clip reports only: unpublish the clip, then close its reports. */
  | { action: "take_down"; reason: RejectReason | "custom"; note?: string };

/** Closes every open report on one target, optionally taking the clip down first. */
export async function resolveReports(
  actor: Actor,
  target: { targetType: ReportTarget; targetId: string },
  input: ResolveInput,
): Promise<{ ok: true; closed: number } | { ok: false; error: "not_found" | "bad_input" }> {
  assertCan(actor, { report: ["review"] }, "triage reports");
  if (input.action === "take_down") {
    if (target.targetType !== "clip") return { ok: false, error: "bad_input" };
    const r = await reviewClip(actor, target.targetId, {
      decision: "unpublish",
      reason: input.reason,
      note: input.note,
    });
    if (!r.ok && r.error !== "wrong_status")
      return { ok: false, error: r.error === "not_found" ? "not_found" : "bad_input" };
  }
  const status = input.action === "dismiss" ? "dismissed" : "resolved";
  const closed = await db()
    .update(report)
    .set({
      status,
      resolvedByUserId: actor.id,
      resolvedAt: new Date(),
      resolution: input.note?.slice(0, 500) ?? null,
    })
    .where(
      and(
        eq(report.targetType, target.targetType),
        eq(report.targetId, target.targetId),
        eq(report.status, "open"),
      ),
    )
    .returning({ id: report.id });
  await audit(actor.id, {
    action: `report.${input.action}`,
    targetType: target.targetType,
    targetId: target.targetId,
    meta: { closed: closed.length },
  });
  return { ok: true, closed: closed.length };
}
