import { describe, expect, it } from "vitest";
import { isBlockedAuthPath } from "../src/next-handler";

describe("isBlockedAuthPath", () => {
  it.each([
    "/api/auth/admin/ban-user",
    "/api/auth/admin/list-users",
    "/api/auth/admin/set-role",
    "/api/auth/admin/impersonate-user",
    "/api/auth/admin",
    "/api/auth/admin/",
    "/api/auth/ADMIN/ban-user",
    "/api/auth//admin/ban-user".replace("//", "/"),
  ])("blocks %s", (p) => {
    expect(isBlockedAuthPath(p)).toBe(true);
  });

  it.each([
    "/api/auth/get-session",
    "/api/auth/sign-in/social",
    "/api/auth/callback/twitch",
    "/api/auth/link-social",
    "/api/auth/administrator",
  ])("allows %s", (p) => {
    expect(isBlockedAuthPath(p)).toBe(false);
  });
});
