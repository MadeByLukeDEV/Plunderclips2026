import { env } from "@plunderclips/shared";
import { getAuth } from "./auth";
import type { Role } from "./permissions";

/**
 * Dev login: email + password test accounts, one per role, for local testing without OAuth apps.
 * Off unless DEV_LOGIN=true, and never in production whatever the flag says.
 */
export function devLoginEnabled(): boolean {
  const e = env();
  return e.NODE_ENV !== "production" && e.DEV_LOGIN === "true";
}

/** Local test accounts only. These never exist in production (email sign-in is off there). */
export const DEV_PASSWORD = "plunder-dev-only-1234";

export const DEV_USERS: { role: Role; email: string; name: string }[] = [
  { role: "admin", email: "admin@plunderclips.test", name: "Test Admin" },
  { role: "mod", email: "mod@plunderclips.test", name: "Test Mod" },
  { role: "creator", email: "creator@plunderclips.test", name: "Test Creator" },
  { role: "user", email: "user@plunderclips.test", name: "Test User" },
];

export function isDevRole(v: unknown): v is Role {
  return DEV_USERS.some((u) => u.role === v);
}

/** Signs in as the seeded test user for a role. Call from a server action (cookies are set by nextCookies). */
export async function signInAsDevUser(role: Role, headers: Headers): Promise<void> {
  if (!devLoginEnabled()) throw new Error("Dev login is disabled");
  const user = DEV_USERS.find((u) => u.role === role);
  if (!user) throw new Error(`No dev user for role ${role}`);
  await getAuth().api.signInEmail({
    body: { email: user.email, password: DEV_PASSWORD },
    headers,
  });
}
