"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { getSession } from "@plunderclips/identity";
import { slidingWindow } from "@plunderclips/shared";
import {
  addBoardItem,
  createSession,
  deleteBoardItem,
  deleteSession,
  rsvp,
  updateBoardItem,
  type BoardResult,
  type RsvpStatus,
} from "@plunderclips/social";

/** null: done. A string: what to tell the member. */
export type CollabActionResult = string | null;

async function me() {
  const session = await getSession(await headers());
  if (!session || (session.user as { banned?: boolean | null }).banned) return null;
  const r = await slidingWindow(`collab:${session.user.id}`, 120, 60 * 60);
  return r.ok ? session.user.id : "limited";
}

function message(r: BoardResult): CollabActionResult {
  if (r.ok) return null;
  return {
    forbidden: "You can't change that.",
    not_found: "That's gone. Refresh the page.",
    invalid: "Check the details and try again.",
    too_many: "That's the most this crew can have. Clear some out first.",
  }[r.error];
}

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);

export async function boardAction(
  op:
    | { op: "add"; crewId: string; title: string; notes?: string; status?: string }
    | { op: "move"; itemId: string; status: string }
    | { op: "delete"; itemId: string },
): Promise<CollabActionResult> {
  const id = await me();
  if (!id) return "Sign in again to do that.";
  if (id === "limited") return "Slow down a little and try again later.";
  switch (op.op) {
    case "add":
      return message(
        await addBoardItem(id, str(op.crewId, 64), {
          title: str(op.title, 300),
          notes: str(op.notes, 2000),
          status: str(op.status, 20),
        }),
      );
    case "move":
      return message(await updateBoardItem(id, str(op.itemId, 64), { status: str(op.status, 20) }));
    case "delete":
      return message(await deleteBoardItem(id, str(op.itemId, 64)));
    default:
      return "Unknown action.";
  }
}

export async function sessionAction(
  slug: string,
  op:
    | {
        op: "create";
        crewId: string;
        title: string;
        notes?: string;
        startsAt: string;
        durationMin: number;
        isPublic: boolean;
      }
    | { op: "delete"; sessionId: string }
    | { op: "rsvp"; sessionId: string; status: RsvpStatus | null },
): Promise<CollabActionResult> {
  const id = await me();
  if (!id) return "Sign in again to do that.";
  if (id === "limited") return "Slow down a little and try again later.";
  let r: BoardResult;
  switch (op.op) {
    case "create":
      r = await createSession(id, str(op.crewId, 64), {
        title: str(op.title, 300),
        notes: str(op.notes, 2000),
        startsAt: str(op.startsAt, 40),
        durationMin: Number(op.durationMin),
        isPublic: op.isPublic === true,
      });
      break;
    case "delete":
      r = await deleteSession(id, str(op.sessionId, 64));
      break;
    case "rsvp":
      r = await rsvp(
        id,
        str(op.sessionId, 64),
        op.status === "going" || op.status === "maybe" ? op.status : null,
      );
      break;
    default:
      return "Unknown action.";
  }
  // Public sessions show on the cached crew page.
  if (r.ok) updateTag(`crew:${String(slug).toLowerCase()}`);
  return message(r);
}
