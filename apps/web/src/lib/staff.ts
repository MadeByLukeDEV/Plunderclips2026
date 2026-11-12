import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSession, rolesOf, type Session } from "@plunderclips/identity";
import { isStaff, type Actor } from "@plunderclips/moderation";

export type Staff = { session: Session; actor: Actor; headers: Headers };

async function current(): Promise<Staff | null> {
  const h = await headers();
  const session = await getSession(h);
  if (!session || (session.user as { banned?: boolean | null }).banned) return null;
  const actor: Actor = { id: session.user.id, roles: rolesOf(session) };
  return { session, actor, headers: h };
}

/**
 * For admin pages: a staff member, or a 404 for everyone else (signed-out visitors go to sign-in).
 * The admin area doesn't announce itself to people who can't use it.
 */
export async function requireStaff(next: string): Promise<Staff> {
  const s = await current();
  if (!s) {
    const h = await headers();
    if (!(await getSession(h))) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
    notFound();
  }
  if (!isStaff(s.actor)) notFound();
  return s;
}

/** For server actions: the staff member, or null. The moderation module checks permissions again. */
export async function staffOrNull(): Promise<Staff | null> {
  const s = await current();
  return s && isStaff(s.actor) ? s : null;
}
