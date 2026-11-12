/**
 * @plunderclips/identity — auth (Better Auth), roles, sessions, linked platform accounts.
 *
 * Public API of this module. Server code only; the browser client is "@plunderclips/identity/client".
 */
export { getAuth, enabledProviders, SUPPORTED_PROVIDERS, type Auth, type ProviderId } from "./auth";
export { getSession, rolesOf, hasRole, hasPermission, type Session } from "./session";
export { roles, ROLES, statement, type Role } from "./permissions";
export { authRouteHandlers } from "./next-handler";
export { devLoginEnabled, isDevRole, signInAsDevUser, DEV_USERS } from "./dev-login";
