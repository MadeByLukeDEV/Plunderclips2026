"use server";

import { headers } from "next/headers";
import { createReport, type ReportTarget } from "@plunderclips/moderation";
import { currentVoter } from "@/lib/voter";

export type ReportState =
  { status: "idle" } | { status: "done" } | { status: "error"; message: string };

/** Public: anyone can report a clip or a creator page (signed-in members by account, others by IP hash). */
export async function reportAction(
  target: { targetType: ReportTarget; targetId: string },
  _prev: ReportState,
  form: FormData,
): Promise<ReportState> {
  const reporter = await currentVoter(await headers());
  const r = await createReport(reporter, {
    ...target,
    reason: String(form.get("reason") ?? ""),
    note: String(form.get("note") ?? "").slice(0, 600),
  });
  if (r.ok) return { status: "done" };
  return {
    status: "error",
    message:
      r.error === "rate_limited"
        ? "That's a lot of reports. Try again later."
        : r.error === "bad_input"
          ? 'Pick a reason. For "something else", tell us what\'s wrong.'
          : "We couldn't send that report.",
  };
}
