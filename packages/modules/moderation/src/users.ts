import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { getAuth, ROLES, type Role } from "@plunderclips/identity";
import { assertCan, canSetRoles, type Actor } from "./actor";
import { audit } from "./audit";

const { user, creatorProfile, clip } = schema;

export type UserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  roles: Role[];
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  handle: string | null;
  clips: number;
  createdAt: Date;
};

const rolesOf = (raw: string | null): Role[] =>
  (raw ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is Role => (ROLES as string[]).includes(r));

/** Members, newest first, searchable by name, email or handle. Read straight from the DB. */
export async function listUsers(
  actor: Actor,
  opts: { q?: string | null; filter?: "all" | "staff" | "banned"; offset?: number } = {},
): Promise<{ users: UserRow[]; hasMore: boolean }> {
  assertCan(actor, { user: ["list"] }, "list users");
  const limit = 30;
  const where = [];
  const q = opts.q?.trim().slice(0, 80);
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    // Only admins can search by email; mods search by name or handle.
    where.push(
      canSetRoles(actor)
        ? or(ilike(user.name, like), ilike(user.email, like), ilike(creatorProfile.handle, like))!
        : or(ilike(user.name, like), ilike(creatorProfile.handle, like))!,
    );
  }
  if (opts.filter === "banned") where.push(eq(user.banned, true));
  if (opts.filter === "staff") where.push(sql`${user.role} ~ '(^|,)\\s*(mod|admin)\\s*(,|$)'`);

  const rows = await db()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      handle: creatorProfile.handle,
      createdAt: user.createdAt,
      clips: sql<number>`(select count(*) from ${clip} where ${clip.submittedByUserId} = ${user.id})`,
    })
    .from(user)
    .leftJoin(creatorProfile, eq(creatorProfile.userId, user.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(limit + 1)
    .offset(Math.max(opts.offset ?? 0, 0));
  return {
    users: rows.slice(0, limit).map((r) => ({
      ...r,
      roles: rolesOf(r.role),
      banned: !!r.banned,
      clips: Number(r.clips),
    })),
    hasMore: rows.length > limit,
  };
}

async function targetRoles(userId: string): Promise<Role[] | null> {
  const [row] = await db()
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ? rolesOf(row.role) : null;
}

export type UserActionResult = { ok: true } | { ok: false; error: string };

const isStaffRole = (r: Role[]) => r.includes("mod") || r.includes("admin");

/**
 * Ban or unban through Better Auth's admin plugin (it checks the session's permissions too).
 * Our extra rule: only admins can ban staff, and nobody bans an admin.
 */
export async function setBan(
  actor: Actor,
  headers: Headers,
  userId: string,
  input: { banned: true; reason: string; days?: number | null } | { banned: false },
): Promise<UserActionResult> {
  assertCan(actor, { user: ["ban"] }, "ban users");
  const roles = await targetRoles(userId);
  if (!roles) return { ok: false, error: "That account doesn't exist any more." };
  if (userId === actor.id) return { ok: false, error: "You can't ban yourself." };
  if (input.banned) {
    if (roles.includes("admin"))
      return { ok: false, error: "Admins can't be banned. Change their role first." };
    if (isStaffRole(roles) && !canSetRoles(actor))
      return { ok: false, error: "Only an admin can ban a mod." };
    const reason = input.reason.trim().slice(0, 200);
    if (!reason) return { ok: false, error: "Add a reason. The member sees it." };
    const days = input.days && input.days > 0 ? Math.min(input.days, 3650) : null;
    await getAuth().api.banUser({
      body: { userId, banReason: reason, ...(days ? { banExpiresIn: days * 86_400 } : {}) },
      headers,
    });
    await audit(actor.id, {
      action: "user.ban",
      targetType: "user",
      targetId: userId,
      meta: { reason, days },
    });
  } else {
    await getAuth().api.unbanUser({ body: { userId }, headers });
    await audit(actor.id, { action: "user.unban", targetType: "user", targetId: userId });
  }
  return { ok: true };
}

/** Admins only. The plugin enforces user:set-role; we also stop an admin removing their own admin role. */
export async function setRoles(
  actor: Actor,
  headers: Headers,
  userId: string,
  next: string[],
): Promise<UserActionResult> {
  assertCan(actor, { user: ["set-role"] }, "change roles");
  const before = await targetRoles(userId);
  if (!before) return { ok: false, error: "That account doesn't exist any more." };
  const roles = [...new Set(next.filter((r): r is Role => (ROLES as string[]).includes(r)))];
  if (!roles.length) roles.push("user");
  if (userId === actor.id && before.includes("admin") && !roles.includes("admin"))
    return { ok: false, error: "You can't remove your own admin role. Ask another admin." };
  await getAuth().api.setRole({ body: { userId, role: roles }, headers });
  await audit(actor.id, {
    action: "user.role",
    targetType: "user",
    targetId: userId,
    meta: { from: before, to: roles },
  });
  return { ok: true };
}
