import { getAuth } from "./auth";
import type { Role } from "./permissions";

export async function getSession(headers: Headers) {
  return getAuth().api.getSession({ headers });
}

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** A user's roles. Better Auth stores several roles as one comma-separated string. */
export function rolesOf(session: Session | null): Role[] {
  const raw = (session?.user as { role?: string | null } | undefined)?.role ?? "";
  return raw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean) as Role[];
}

export function hasRole(session: Session | null, ...wanted: Role[]) {
  const mine = rolesOf(session);
  return wanted.some((r) => mine.includes(r));
}
