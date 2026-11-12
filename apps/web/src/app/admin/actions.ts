"use server";

import { updateTag } from "next/cache";
import {
  ForbiddenError,
  REJECT_REASONS,
  arrangeSection,
  resolveReports,
  reviewClip,
  setBan,
  setRoles,
  type RejectReason,
  type ReportTarget,
  type ReviewInput,
} from "@plunderclips/moderation";
import { staffOrNull } from "@/lib/staff";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

const NOT_ALLOWED: ActionResult = { ok: false, message: "You don't have permission for that." };

/** Runs a staff action: no staff session or a ForbiddenError from the module both end as "not allowed". */
async function asStaff<T extends ActionResult>(
  fn: (s: NonNullable<Awaited<ReturnType<typeof staffOrNull>>>) => Promise<T>,
): Promise<ActionResult> {
  const s = await staffOrNull();
  if (!s) return NOT_ALLOWED;
  try {
    return await fn(s);
  } catch (err) {
    if (err instanceof ForbiddenError) return NOT_ALLOWED;
    throw err;
  }
}

const reasonOf = (v: FormDataEntryValue | null): RejectReason | "custom" =>
  typeof v === "string" && (v === "custom" || v in REJECT_REASONS)
    ? (v as RejectReason | "custom")
    : "custom";

// --- Review queue ---------------------------------------------------------------

export async function reviewAction(clipId: string, form: FormData): Promise<ActionResult> {
  return asStaff(async ({ actor }) => {
    const decision = form.get("decision");
    const tags = form.getAll("tag").filter((t): t is string => typeof t === "string");
    const sections = form
      .getAll("section")
      .filter((s): s is string => typeof s === "string")
      .map((slug) => ({ slug }));
    const note = (form.get("note") as string | null)?.slice(0, 500) ?? "";

    let input: ReviewInput;
    switch (decision) {
      case "approve":
        input = { decision: "approve", tags, sections };
        break;
      case "update":
        input = { decision: "update", tags, sections };
        break;
      case "reject":
      case "unpublish":
        input = { decision, reason: reasonOf(form.get("reason")), note };
        break;
      default:
        return { ok: false, message: "Unknown action." };
    }

    const r = await reviewClip(actor, clipId, input);
    if (!r.ok)
      return {
        ok: false,
        message:
          r.error === "wrong_status"
            ? "Someone else reviewed this clip a moment ago. Reload to see it."
            : r.error === "bad_input"
              ? "Pick a reason, or write one for the submitter."
              : "That clip is gone.",
      };
    // Publishing, unpublishing or re-curating changes public lists and pages.
    if (decision !== "reject") updateTag("clips");
    return {
      ok: true,
      message: {
        approve: "Published.",
        update: "Saved.",
        reject: "Rejected.",
        unpublish: "Taken down.",
      }[decision],
    };
  });
}

// --- Sections -------------------------------------------------------------------

export async function arrangeAction(
  slug: string,
  period: string,
  order: string[],
): Promise<ActionResult> {
  return asStaff(async ({ actor }) => {
    await arrangeSection(actor, slug, period, order.slice(0, 200));
    updateTag("clips");
    return { ok: true };
  });
}

// --- Reports --------------------------------------------------------------------

export async function resolveAction(
  target: { targetType: ReportTarget; targetId: string },
  form: FormData,
): Promise<ActionResult> {
  return asStaff(async ({ actor }) => {
    const action = form.get("action");
    const note = (form.get("note") as string | null)?.slice(0, 500) ?? "";
    const r =
      action === "take_down"
        ? await resolveReports(actor, target, {
            action: "take_down",
            reason: reasonOf(form.get("reason")),
            note,
          })
        : await resolveReports(actor, target, { action: "dismiss", note });
    if (!r.ok)
      return {
        ok: false,
        message: r.error === "not_found" ? "That clip is gone." : "Pick a reason first.",
      };
    if (action === "take_down") updateTag("clips");
    return { ok: true, message: `Closed ${r.closed} ${r.closed === 1 ? "report" : "reports"}.` };
  });
}

// --- Members --------------------------------------------------------------------

export async function banAction(userId: string, form: FormData): Promise<ActionResult> {
  return asStaff(async ({ actor, headers }) => {
    const days = Number(form.get("days") ?? 0);
    const r = await setBan(actor, headers, userId, {
      banned: true,
      reason: String(form.get("reason") ?? ""),
      days: Number.isFinite(days) ? days : null,
    });
    if (!r.ok) return { ok: false, message: r.error };
    // A banned member's creator page disappears.
    updateTag("creators");
    return { ok: true, message: "Banned. Their sessions are signed out." };
  });
}

export async function unbanAction(userId: string): Promise<ActionResult> {
  return asStaff(async ({ actor, headers }) => {
    const r = await setBan(actor, headers, userId, { banned: false });
    if (!r.ok) return { ok: false, message: r.error };
    updateTag("creators");
    return { ok: true, message: "Unbanned." };
  });
}

export async function rolesAction(userId: string, form: FormData): Promise<ActionResult> {
  return asStaff(async ({ actor, headers }) => {
    const roles = form.getAll("role").filter((r): r is string => typeof r === "string");
    const r = await setRoles(actor, headers, userId, ["user", ...roles]);
    if (!r.ok) return { ok: false, message: r.error };
    return { ok: true, message: "Roles saved." };
  });
}
