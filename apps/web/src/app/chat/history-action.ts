"use server";

import { headers } from "next/headers";
import { getSession } from "@plunderclips/identity";
import { channelFor, listMessages, toWire, type ChatMessageWire } from "@plunderclips/social";

/** The page of messages before `before`, for "Older messages". */
export async function olderMessagesAction(
  channelId: string,
  before: number,
): Promise<{ messages: ChatMessageWire[]; hasOlder: boolean } | null> {
  const session = await getSession(await headers());
  if (!session || !(await channelFor(String(channelId), session.user.id))) return null;
  const r = await listMessages(String(channelId), { before: Number(before) || undefined });
  return { messages: r.messages.map(toWire), hasOlder: r.hasOlder };
}
