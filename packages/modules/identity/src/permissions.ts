import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Roles and what they may do. Shared by the server (admin plugin) and the client (permission checks in UI).
 *   user     signed-in member: submit clips, manage own profile
 *   creator  verified streamer: clips skip the review queue
 *   mod      reviews the queue, handles reports, can ban
 *   admin    everything, including roles and impersonation
 */
export const statement = {
  ...defaultStatements,
  clip: ["submit", "publish-direct", "review", "feature", "delete-any"],
  report: ["create", "review"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  user: ac.newRole({ clip: ["submit"], report: ["create"] }),
  creator: ac.newRole({ clip: ["submit", "publish-direct"], report: ["create"] }),
  mod: ac.newRole({
    clip: ["submit", "publish-direct", "review", "feature", "delete-any"],
    report: ["create", "review"],
    user: ["list", "get", "ban"],
    session: ["list", "revoke"],
  }),
  admin: ac.newRole({
    ...adminAc.statements,
    clip: ["submit", "publish-direct", "review", "feature", "delete-any"],
    report: ["create", "review"],
  }),
};

export type Role = keyof typeof roles;
export const ROLES = Object.keys(roles) as Role[];
