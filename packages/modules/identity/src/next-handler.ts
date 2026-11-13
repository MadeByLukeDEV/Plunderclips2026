import { toNextJsHandler } from "better-auth/next-js";
import { clientIp } from "@plunderclips/shared";
import { CLIENT_IP_HEADER, getAuth } from "./auth";

/**
 * Better Auth endpoints that must not be reachable over HTTP. The admin plugin's routes
 * (/admin/ban-user, /admin/list-users, /admin/set-role, /admin/impersonate-user, …) only check
 * role permissions, so a mod could call them directly and skip the moderation module's rules
 * (only admins ban mods, nobody bans an admin, emails stay hidden from mods). The app calls
 * these through `auth.api.*` on the server, which doesn't go through this route.
 */
export function isBlockedAuthPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  return /\/api\/auth\/admin(\/|$)/.test(path);
}

const notFound = () => Response.json({ message: "Not found" }, { status: 404 });

/** The request Better Auth sees: our trusted client IP in our own header, never the client's copy. */
export function withTrustedIp(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = clientIp(request.headers);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  // Built from its parts: Next passes a NextRequest, which `new Request(request, …)` can't copy.
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(request.url, {
    method: request.method,
    headers,
    body: hasBody ? request.body : null,
    signal: request.signal,
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

/** Route handlers for app/api/auth/[...all]. The auth instance is built on the first request, not at build time. */
export const authRouteHandlers = {
  GET: (request: Request) =>
    isBlockedAuthPath(new URL(request.url).pathname)
      ? notFound()
      : toNextJsHandler(getAuth()).GET(withTrustedIp(request)),
  POST: (request: Request) =>
    isBlockedAuthPath(new URL(request.url).pathname)
      ? notFound()
      : toNextJsHandler(getAuth()).POST(withTrustedIp(request)),
};
