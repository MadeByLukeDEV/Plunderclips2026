"use server";

import { headers } from "next/headers";
import { getSession } from "@plunderclips/identity";
import { listNotifications, markRead } from "@plunderclips/notifications";
import { toView, type NotificationView } from "@/components/notifications/describe";

/** The latest notifications for the bell. null when signed out. */
export async function latestNotificationsAction(): Promise<NotificationView[] | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  const { items } = await listNotifications(session.user.id, { limit: 8 });
  return items.map(toView);
}

/** Marks the given notifications read, or all of them without ids. */
export async function markReadAction(ids?: number[]): Promise<void> {
  const session = await getSession(await headers());
  if (!session) return;
  await markRead(session.user.id, ids?.map(Number));
}
