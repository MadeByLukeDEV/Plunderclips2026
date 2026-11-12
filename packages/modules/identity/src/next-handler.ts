import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "./auth";

/** Route handlers for app/api/auth/[...all]. The auth instance is built on the first request, not at build time. */
export const authRouteHandlers = {
  GET: (request: Request) => toNextJsHandler(getAuth()).GET(request),
  POST: (request: Request) => toNextJsHandler(getAuth()).POST(request),
};
