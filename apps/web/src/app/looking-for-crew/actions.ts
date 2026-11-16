"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, rolesOf } from "@plunderclips/identity";
import { slidingWindow } from "@plunderclips/shared";
import { createLfcPost, deleteLfcPost, LFC_ACTIVE_MAX } from "@plunderclips/social";

export type LfcFormState = { status: "idle" } | { status: "error"; message: string };

const text = (f: FormData, k: string, max: number) => {
  const v = f.get(k);
  return typeof v === "string" ? v.slice(0, max) : "";
};

export async function createLfcAction(_p: LfcFormState, form: FormData): Promise<LfcFormState> {
  const session = await getSession(await headers());
  if (!session) return { status: "error", message: "Sign in again to post." };
  if ((session.user as { banned?: boolean | null }).banned)
    return { status: "error", message: "Your account can't post." };
  const limited = await slidingWindow(`lfc:${session.user.id}`, 10, 24 * 60 * 60);
  if (!limited.ok) return { status: "error", message: "That's a lot of posts for one day." };
  const r = await createLfcPost(session.user.id, {
    title: text(form, "title", 200),
    body: text(form, "body", 1000),
    region: text(form, "region", 10),
    platform: text(form, "platform", 20),
    ship: text(form, "ship", 20),
    styles: form.getAll("styles").map((s) => String(s).slice(0, 20)),
    availability: text(form, "availability", 200),
    crewId: text(form, "crewId", 64) || null,
  });
  if (!r.ok)
    return {
      status: "error",
      message: {
        no_profile: "Make your creator page first.",
        invalid: "Give your post a title.",
        too_many: `You already have ${LFC_ACTIVE_MAX} open posts. Close one first.`,
        forbidden: "Only the captain or an officer can post for that crew.",
        not_found: "That crew is gone.",
      }[r.error],
    };
  updateTag("lfc");
  redirect("/looking-for-crew");
}

export async function deleteLfcAction(postId: string): Promise<string | null> {
  const session = await getSession(await headers());
  if (!session) return "Sign in again.";
  const r = await deleteLfcPost({ id: session.user.id, roles: rolesOf(session) }, String(postId));
  if (!r.ok)
    return r.error === "forbidden" ? "You can only close your own posts." : "That post is gone.";
  updateTag("lfc");
  return null;
}
