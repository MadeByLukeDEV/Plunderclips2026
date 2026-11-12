"use server";

import { headers } from "next/headers";
import { submitClip, type SubmitError, type SubmittedClip } from "@plunderclips/clips";
import { getSession, hasPermission } from "@plunderclips/identity";
import { clientIp } from "@plunderclips/shared";

export type SubmitState =
  | { status: "idle" }
  | {
      status: "error";
      error: SubmitError;
      message: string;
      url: string;
      title: string;
      note: string;
    }
  | { status: "done"; duplicate: boolean; clip: SubmittedClip };

const field = (f: FormData, k: string, max = 4096) => {
  const v = f.get(k);
  return typeof v === "string" ? v.slice(0, max) : "";
};

export async function submitClipAction(_prev: SubmitState, form: FormData): Promise<SubmitState> {
  const h = await headers();
  const session = await getSession(h);
  const url = field(form, "url", 2048);
  const title = field(form, "title", 500);
  const note = field(form, "note", 1000);

  const result = await submitClip(
    { url, title, note, turnstileToken: field(form, "cf-turnstile-response", 2048) },
    {
      userId: session?.user.id ?? null,
      trusted: hasPermission(session, { clip: ["publish-direct"] }),
      ip: clientIp(h),
    },
  );

  if (result.ok) return { status: "done", duplicate: result.duplicate, clip: result.clip };
  return {
    status: "error",
    error: result.error,
    message: messageFor(result.error, result.retryAfterSeconds),
    url,
    title,
    note,
  };
}

function messageFor(error: SubmitError, retryAfter?: number): string {
  switch (error) {
    case "invalid_url":
      return "That doesn't look like a link. Paste the full clip URL.";
    case "unsupported_platform":
      return "We take clips from Twitch, YouTube, Kick, Medal, TikTok and X.";
    case "unsupported_url":
      return "That's the right site, but not a link to a clip or video. Open the clip and copy its URL.";
    case "captcha_failed":
      return "The bot check didn't go through. Try once more.";
    case "rate_limited": {
      const minutes = Math.max(1, Math.ceil((retryAfter ?? 60) / 60));
      return `That's a lot of clips in a short time. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    case "title_required":
      return "We couldn't read a title from that link. Add one and send it again.";
    case "title_too_long":
      return "Keep the title under 120 characters.";
    case "note_too_long":
      return "Keep the note under 280 characters.";
  }
}
