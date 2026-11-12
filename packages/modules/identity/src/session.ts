import { getAuth } from "./auth";
import { roles, type Role, type statement } from "./permissions";

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

type Permissions = { [K in keyof typeof statement]?: (typeof statement)[K][number][] };

/** True when any of the user's roles grants every listed permission. Banned users get nothing. */
export function hasPermission(session: Session | null, permissions: Permissions): boolean {
  if (!session || (session.user as { banned?: boolean | null }).banned) return false;
  return rolesOf(session).some(
    (r) =>
      roles[r]?.authorize(permissions as Parameters<(typeof roles)[Role]["authorize"]>[0]).success,
  );
}
