import { describe, expect, it } from "vitest";
import { hasRole, rolesOf, type Session } from "../src/session";

const withRole = (role: string | null) => ({ user: { role } }) as unknown as Session;

describe("rolesOf", () => {
  it("splits comma-separated roles and trims them", () => {
    expect(rolesOf(withRole("mod, creator"))).toEqual(["mod", "creator"]);
  });
  it("returns no roles for a signed-out visitor or an empty role", () => {
    expect(rolesOf(null)).toEqual([]);
    expect(rolesOf(withRole(null))).toEqual([]);
    expect(rolesOf(withRole(""))).toEqual([]);
  });
});

describe("hasRole", () => {
  it("matches any of the wanted roles", () => {
    expect(hasRole(withRole("creator"), "mod", "creator")).toBe(true);
    expect(hasRole(withRole("user"), "mod", "admin")).toBe(false);
  });
});
