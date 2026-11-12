import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, type Session } from "@plunderclips/identity";

/** Data-access-layer guard: the signed-in session, or a redirect to sign-in. Call inside a Suspense boundary. */
export async function requireSession(next: string): Promise<Session> {
  const session = await getSession(await headers());
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return session;
}
