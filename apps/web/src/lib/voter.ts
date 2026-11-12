import "server-only";
import type { Voter } from "@plunderclips/clips";
import { getSession } from "@plunderclips/identity";
import { clientIp, hashIp } from "@plunderclips/shared";

/** The current visitor as a voter: their account when signed in, else their salted IP hash. */
export async function currentVoter(headers: Headers): Promise<Voter | null> {
  const session = await getSession(headers);
  if (session) return { userId: session.user.id };
  const ipHash = hashIp(clientIp(headers));
  return ipHash ? { ipHash } : null;
}
