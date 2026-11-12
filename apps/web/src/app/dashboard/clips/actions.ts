"use server";

import { headers } from "next/headers";
import { withdrawClip } from "@plunderclips/clips";
import { getSession } from "@plunderclips/identity";

/** Takes back the member's own pending clip. Pending clips aren't in any public cache. */
export async function withdrawAction(clipId: string): Promise<{ ok: boolean; message?: string }> {
  const session = await getSession(await headers());
  if (!session) return { ok: false, message: "Your session ended. Sign in again." };
  const r = await withdrawClip(session.user.id, clipId);
  if (r.ok) return { ok: true };
  return {
    ok: false,
    message:
      r.error === "not_pending"
        ? "A mod already looked at this clip, so it can't be withdrawn."
        : "That clip is gone already.",
  };
}
