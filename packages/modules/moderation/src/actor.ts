import { can, type Permissions } from "@plunderclips/identity";

/** Who is acting. Built by the web app from the session; checked again here before any write. */
export type Actor = { id: string; roles: readonly string[] };

export class ForbiddenError extends Error {
  constructor(what: string) {
    super(`Not allowed: ${what}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(actor: Actor, permissions: Permissions, what: string): void {
  if (!can(actor.roles, permissions)) throw new ForbiddenError(what);
}

export const canReview = (a: Actor) => can(a.roles, { clip: ["review"] });
export const canFeature = (a: Actor) => can(a.roles, { clip: ["feature"] });
export const canTriageReports = (a: Actor) => can(a.roles, { report: ["review"] });
export const canBan = (a: Actor) => can(a.roles, { user: ["ban"] });
export const canSetRoles = (a: Actor) => can(a.roles, { user: ["set-role"] });
export const isStaff = (a: Actor) => canReview(a) || canTriageReports(a);
