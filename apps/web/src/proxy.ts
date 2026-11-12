import { NextResponse, type NextRequest } from "next/server";
import { hasSessionCookie } from "@plunderclips/identity/proxy";

/** Optimistic guard: no session cookie → send to sign-in. Pages still check the session on the server. */
export function proxy(request: NextRequest) {
  if (!hasSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
