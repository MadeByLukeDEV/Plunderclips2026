"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, rolesOf } from "@plunderclips/identity";
import {
  deleteMessage,
  markRead,
  openDm,
  sendMessage,
  toWire,
  MESSAGE_MAX,
  type ChatMessageWire,
} from "@plunderclips/social";

export type SendState = { ok: true; message: ChatMessageWire } | { ok: false; error: string };

async function me() {
  const session = await getSession(await headers());
  return session && !(session.user as { banned?: boolean | null }).banned ? session : null;
}

export async function sendAction(channelId: string, body: string): Promise<SendState> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in again to send messages." };
  const r = await sendMessage(
    s.user.id,
    String(channelId),
    String(body).slice(0, MESSAGE_MAX + 200),
  );
  if (r.ok) return { ok: true, message: toWire(r.message) };
  return {
    ok: false,
    error:
      {
        empty: "Write something first.",
        too_long: `Keep it to ${MESSAGE_MAX} characters.`,
        rate_limited: "Slow down a little. Try again in a few seconds.",
        banned: "Your account can't send messages.",
        forbidden: "You're not in this conversation any more.",
      }[r.error as "empty"] ?? "That didn't send. Try again.",
  };
}

export async function deleteAction(messageId: number): Promise<string | null> {
  const s = await me();
  if (!s) return "Sign in again.";
  const r = await deleteMessage({ id: s.user.id, roles: rolesOf(s) }, Number(messageId));
  return r.ok
    ? null
    : r.error === "forbidden"
      ? "You can only remove your own messages."
      : "That message is gone.";
}

export async function markReadAction(channelId: string, id: number): Promise<void> {
  const s = await me();
  if (s) await markRead(s.user.id, String(channelId), Number(id));
}

/** From a creator page's "Message" button. */
export async function openDmAction(otherUserId: string, handle: string): Promise<string> {
  const s = await me();
  if (!s) redirect(`/sign-in?next=/c/${encodeURIComponent(handle)}`);
  const r = await openDm(s.user.id, String(otherUserId));
  if (r.ok) redirect(`/chat/${r.channelId}`);
  return (
    {
      no_profile: "Make your creator page first, then you can message other creators.",
      not_allowed: "You can message crewmates, and creators who follow you.",
      not_found: "That creator page is gone.",
      self: "That's you.",
    }[r.error as "self"] ?? "Couldn't open the conversation."
  );
}
