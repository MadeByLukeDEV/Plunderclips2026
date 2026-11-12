"use server";

import { headers } from "next/headers";
import { setFollow } from "@plunderclips/creators";
import { getSession } from "@plunderclips/identity";
import { slidingWindow } from "@plunderclips/shared";

export type FollowState = { following: boolean; followers: number };

/** Follow or unfollow. null: not signed in, rate limited, or the creator is gone. */
export async function followAction(creatorId: string, on: boolean): Promise<FollowState | null> {
  const session = await getSession(await headers());
  if (!session) return null;
  const limited = await slidingWindow(`follow:${session.user.id}`, 30, 60);
  if (!limited.ok) return null;
  const r = await setFollow(session.user.id, creatorId, on);
  return r.ok ? { following: r.following, followers: r.followers } : null;
}
