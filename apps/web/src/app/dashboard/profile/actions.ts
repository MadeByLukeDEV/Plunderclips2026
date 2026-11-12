"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import {
  BIO_MAX,
  CHANNEL_PLATFORMS,
  DISPLAY_NAME_MAX,
  saveProfile,
  type ChannelPlatform,
  type ProfileFieldError,
} from "@plunderclips/creators";
import { getSession } from "@plunderclips/identity";
import { slidingWindow } from "@plunderclips/shared";

export type ProfileFormState =
  | { status: "idle" }
  | { status: "saved"; handle: string }
  | { status: "error"; errors: Record<string, string>; form?: string };

const text = (f: FormData, k: string, max: number) => {
  const v = f.get(k);
  return typeof v === "string" ? v.slice(0, max) : "";
};

export async function saveProfileAction(
  _prev: ProfileFormState,
  form: FormData,
): Promise<ProfileFormState> {
  const session = await getSession(await headers());
  if (!session) return { status: "error", errors: {}, form: "Your session ended. Sign in again." };
  const limited = await slidingWindow(`profile:${session.user.id}`, 20, 60 * 60);
  if (!limited.ok)
    return { status: "error", errors: {}, form: "That's a lot of saves. Try again in a bit." };

  const channels: Partial<Record<ChannelPlatform, string>> = {};
  for (const p of CHANNEL_PLATFORMS) channels[p] = text(form, `channel.${p}`, 200);

  const r = await saveProfile(session.user.id, {
    handle: text(form, "handle", 60),
    displayName: text(form, "displayName", 200),
    bio: text(form, "bio", 2000),
    banner: text(form, "banner", 40),
    channels,
  });

  if (!r.ok) {
    const errors: Record<string, string> = {};
    for (const e of r.errors) errors[e.field] = message(e);
    return { status: "error", errors };
  }

  updateTag("creators");
  updateTag(`creator:${r.profile.handle}`);
  if (r.previousHandle) updateTag(`creator:${r.previousHandle}`);
  return { status: "saved", handle: r.profile.handle };
}

function message(e: ProfileFieldError): string {
  switch (e.field) {
    case "handle":
      return {
        too_short: "Use at least 3 characters.",
        too_long: "Keep it to 24 characters.",
        invalid_chars: "Letters, numbers, - and _ only, starting with a letter or number.",
        reserved: "That one's reserved. Pick another.",
        taken: "Someone already has that handle.",
      }[e.error];
    case "displayName":
      return e.error === "required" ? "Add a name." : `Keep it to ${DISPLAY_NAME_MAX} characters.`;
    case "bio":
      return `Keep it to ${BIO_MAX} characters.`;
    case "banner":
      return "Pick one of the paintings.";
    default:
      return "That doesn't look like a channel name or link for this platform.";
  }
}
