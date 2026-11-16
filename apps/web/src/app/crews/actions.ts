"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, rolesOf } from "@plunderclips/identity";
import { slidingWindow } from "@plunderclips/shared";
import {
  answerRequest,
  cancelRequest,
  createCrew,
  disbandCrew,
  getCrewBySlug,
  joinCrew,
  leaveCrew,
  removeMember,
  setCrewRole,
  transferCaptain,
  updateCrew,
  CREW_MOTTO_MAX,
  CREW_NAME_MAX,
  CREW_SIZE_MAX,
  CREWS_PER_MEMBER_MAX,
  type CrewError,
  type CrewFieldError,
} from "@plunderclips/social";

export type CrewFormState =
  | { status: "idle" }
  | { status: "saved"; slug: string }
  | { status: "error"; errors: Record<string, string>; form?: string };

/** null: done. A string: what to tell the member. */
export type CrewActionResult = string | null;

const text = (f: FormData, k: string, max: number) => {
  const v = f.get(k);
  return typeof v === "string" ? v.slice(0, max) : "";
};

async function member(bucket: string, limit = 30) {
  const session = await getSession(await headers());
  if (!session || (session.user as { banned?: boolean | null }).banned) return null;
  const r = await slidingWindow(`crew:${bucket}:${session.user.id}`, limit, 60 * 60);
  return r.ok ? session : "limited";
}

function expire(...slugs: (string | null | undefined)[]) {
  updateTag("crews");
  for (const s of slugs) if (s) updateTag(`crew:${s}`);
}

function fieldMessage(e: CrewFieldError): string {
  switch (e.field) {
    case "slug":
      return {
        too_short: "Use at least 3 characters.",
        too_long: "Keep it to 24 characters.",
        invalid_chars: "Letters, numbers, - and _ only, starting with a letter or number.",
        reserved: "That one's reserved. Pick another.",
        taken: "Another crew already sails under that link.",
      }[e.error];
    case "name":
      return e.error === "required"
        ? "Give your crew a name."
        : `Keep it to ${CREW_NAME_MAX} characters.`;
    case "motto":
      return `Keep it to ${CREW_MOTTO_MAX} characters.`;
    case "banner":
      return "Pick one of the banners.";
    case "joinPolicy":
      return "Choose how people join.";
    case "sevenTvSet":
      return e.error === "invalid"
        ? "Paste a 7TV emote set link, like 7tv.app/emote-sets/01H…"
        : "7TV doesn't know that set. Check the link, or try again if 7TV is down.";
  }
}

function errorMessage(e: CrewError): string {
  return {
    no_profile: "Make your creator page first: crews are made of creators.",
    crew_limit: `You're already in ${CREWS_PER_MEMBER_MAX} crews, the most one member can join.`,
    not_found: "That crew or request is gone. Refresh the page.",
    forbidden: "Only the captain or an officer can do that.",
    full: `This crew is full (${CREW_SIZE_MAX} members).`,
    already_member: "You're already in this crew.",
    already_requested: "Your request is already waiting.",
    not_member: "They're not in this crew any more.",
    captain_must_hand_over: "Hand the captaincy to someone else before you leave.",
    self: "You can't do that to yourself.",
  }[e];
}

const fields = (f: FormData) => ({
  slug: text(f, "slug", 60),
  name: text(f, "name", 200),
  motto: text(f, "motto", 600),
  banner: text(f, "banner", 40),
  joinPolicy: text(f, "joinPolicy", 20),
  sevenTvSet: text(f, "sevenTvSet", 300),
});

export async function createCrewAction(_p: CrewFormState, form: FormData): Promise<CrewFormState> {
  const s = await member("create", 10);
  if (!s) return { status: "error", errors: {}, form: "Your session ended. Sign in again." };
  if (s === "limited")
    return { status: "error", errors: {}, form: "That's a lot of crews. Try again later." };
  const r = await createCrew(s.user.id, fields(form));
  if (!r.ok) {
    if ("error" in r) return { status: "error", errors: {}, form: errorMessage(r.error) };
    return {
      status: "error",
      errors: Object.fromEntries(r.errors.map((e) => [e.field, fieldMessage(e)])),
    };
  }
  expire(r.crew.slug);
  redirect(`/crews/${r.crew.slug}`);
}

export async function updateCrewAction(
  crewId: string,
  _p: CrewFormState,
  form: FormData,
): Promise<CrewFormState> {
  const s = await member("edit");
  if (!s) return { status: "error", errors: {}, form: "Your session ended. Sign in again." };
  if (s === "limited")
    return { status: "error", errors: {}, form: "That's a lot of saves. Try again in a bit." };
  const r = await updateCrew(s.user.id, crewId, fields(form));
  if (!r.ok) {
    if ("error" in r) return { status: "error", errors: {}, form: errorMessage(r.error) };
    return {
      status: "error",
      errors: Object.fromEntries(r.errors.map((e) => [e.field, fieldMessage(e)])),
    };
  }
  expire(r.crew.slug, r.previousSlug);
  return { status: "saved", slug: r.crew.slug };
}

type Op =
  | { op: "join"; message?: string }
  | { op: "cancel" }
  | { op: "leave" }
  | { op: "answer"; userId: string; accept: boolean }
  | { op: "role"; userId: string; role: "officer" | "deckhand" }
  | { op: "transfer"; userId: string }
  | { op: "remove"; userId: string }
  | { op: "disband" };

/** Every button on a crew page goes through here. The social module checks the member's rights. */
export async function crewAction(slug: string, action: Op): Promise<CrewActionResult> {
  const s = await member("act", 120);
  if (!s) return "Sign in again to do that.";
  if (s === "limited") return "Slow down a little and try again in a minute.";
  const crew = await getCrewBySlug(slug);
  if (!crew) return errorMessage("not_found");
  const me = s.user.id;

  let r: { ok: true } | { ok: false; error: CrewError };
  switch (action.op) {
    case "join": {
      const j = await joinCrew(me, crew.id, String(action.message ?? "").slice(0, 400));
      r = j.ok ? { ok: true } : j;
      break;
    }
    case "cancel":
      await cancelRequest(me, crew.id);
      r = { ok: true };
      break;
    case "leave":
      r = await leaveCrew(me, crew.id);
      break;
    case "answer":
      r = await answerRequest(me, crew.id, String(action.userId), action.accept === true);
      break;
    case "role":
      r = await setCrewRole(
        me,
        crew.id,
        String(action.userId),
        action.role === "officer" ? "officer" : "deckhand",
      );
      break;
    case "transfer":
      r = await transferCaptain(me, crew.id, String(action.userId));
      break;
    case "remove":
      r = await removeMember(me, crew.id, String(action.userId));
      break;
    case "disband":
      r = await disbandCrew({ id: me, roles: rolesOf(s) }, crew.id);
      if (r.ok) {
        expire(crew.slug);
        redirect("/crews");
      }
      break;
    default:
      return "Unknown action.";
  }
  if (!r.ok) return errorMessage(r.error);
  expire(crew.slug);
  return null;
}
