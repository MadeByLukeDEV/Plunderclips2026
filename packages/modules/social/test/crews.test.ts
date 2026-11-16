import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Crews against the local Postgres (pnpm dev:services + db:migrate). Skipped without DATABASE_URL.
 * Every user and crew it creates is deleted afterwards.
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("crews (Postgres)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { and, eq, like } = await import("drizzle-orm");
  const c = await import("../src/crews");

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uid = (n: string) => `test-${run}-${n}`;
  const slug = (n: string) => `t${run}${n}`.slice(0, 24);
  const people = ["cap", "off", "deck", "late", "solo", "noprofile", "staff"];

  beforeAll(async () => {
    for (const n of people) {
      await db()
        .insert(schema.user)
        .values({
          id: uid(n),
          name: n,
          email: `${uid(n)}@example.test`,
          role: n === "staff" ? "mod" : "user",
          updatedAt: new Date(),
        });
      if (n !== "noprofile")
        await db()
          .insert(schema.creatorProfile)
          .values({ userId: uid(n), handle: slug(`u${n}`), displayName: n });
    }
  });

  afterAll(async () => {
    await db()
      .delete(schema.crew)
      .where(like(schema.crew.slug, `t${run}%`));
    await db()
      .delete(schema.auditLog)
      .where(eq(schema.auditLog.actorUserId, uid("staff")));
    await db()
      .delete(schema.user)
      .where(like(schema.user.id, `test-${run}-%`));
  });

  const count = async (id: string) =>
    (
      await db()
        .select({ n: schema.crew.memberCount })
        .from(schema.crew)
        .where(eq(schema.crew.id, id))
    )[0]?.n;

  let crewId = "";

  it("needs a creator page to found a crew", async () => {
    const r = await c.createCrew(uid("noprofile"), { slug: slug("x"), name: "X" });
    expect(r).toEqual({ ok: false, error: "no_profile" });
  });

  it("checks the link and name", async () => {
    const r = await c.createCrew(uid("cap"), { slug: "admin", name: " ", motto: "m".repeat(200) });
    expect(r.ok).toBe(false);
    if (r.ok || !("errors" in r)) return;
    expect(r.errors.map((e) => e.field).sort()).toEqual(["motto", "name", "slug"]);
  });

  it("founds a crew with its founder as captain", async () => {
    const r = await c.createCrew(uid("cap"), {
      slug: slug("crew"),
      name: "  The   Salty  Dogs ",
      motto: "Sink first, ask later",
      joinPolicy: "request",
    });
    expect(r.ok).toBe(true);
    if (!r.ok || !("crew" in r)) return;
    crewId = r.crew.id;
    expect(r.crew).toMatchObject({ name: "The Salty Dogs", memberCount: 1, joinPolicy: "request" });
    expect(await c.standing(crewId, uid("cap"))).toEqual({ kind: "member", role: "captain" });
    const again = await c.createCrew(uid("solo"), { slug: slug("crew"), name: "Copy" });
    expect(again).toEqual({ ok: false, errors: [{ field: "slug", error: "taken" }] });
  });

  it("takes requests and lets officers answer them", async () => {
    expect(await c.joinCrew(uid("off"), crewId, "  hi  there ")).toEqual({
      ok: true,
      status: "requested",
    });
    expect(await c.joinCrew(uid("off"), crewId)).toEqual({ ok: false, error: "already_requested" });
    expect((await c.listCrewRequests(crewId))[0]).toMatchObject({
      userId: uid("off"),
      message: "hi there",
    });
    expect(await c.answerRequest(uid("deck"), crewId, uid("off"), true)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await c.answerRequest(uid("cap"), crewId, uid("off"), true)).toEqual({ ok: true });
    expect(await c.setCrewRole(uid("cap"), crewId, uid("off"), "officer")).toEqual({ ok: true });

    await c.joinCrew(uid("deck"), crewId);
    expect(await c.answerRequest(uid("off"), crewId, uid("deck"), true)).toEqual({ ok: true });
    expect(await count(crewId)).toBe(3);
    const roles = (await c.listCrewMembers(crewId)).map((m) => m.role);
    expect(roles).toEqual(["captain", "officer", "deckhand"]);
  });

  it("limits who removes whom", async () => {
    expect(await c.removeMember(uid("deck"), crewId, uid("off"))).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await c.removeMember(uid("off"), crewId, uid("cap"))).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await c.setCrewRole(uid("off"), crewId, uid("deck"), "officer")).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await c.removeMember(uid("off"), crewId, uid("deck"))).toEqual({ ok: true });
    expect(await count(crewId)).toBe(2);
  });

  it("lets everyone waiting in when the doors open", async () => {
    await c.joinCrew(uid("late"), crewId);
    await c.joinCrew(uid("deck"), crewId);
    const r = await c.updateCrew(uid("cap"), crewId, {
      slug: slug("crew2"),
      name: "The Salty Dogs",
      joinPolicy: "open",
    });
    expect(r.ok).toBe(true);
    if (r.ok && "previousSlug" in r) expect(r.previousSlug).toBe(slug("crew"));
    expect(await count(crewId)).toBe(4);
    expect(await c.listCrewRequests(crewId)).toEqual([]);
    expect(await c.updateCrew(uid("off"), crewId, { slug: slug("crew2"), name: "Mine" })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("makes the captain hand over before leaving", async () => {
    expect(await c.leaveCrew(uid("cap"), crewId)).toEqual({
      ok: false,
      error: "captain_must_hand_over",
    });
    expect(await c.transferCaptain(uid("off"), crewId, uid("deck"))).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await c.transferCaptain(uid("cap"), crewId, uid("off"))).toEqual({ ok: true });
    expect(await c.standing(crewId, uid("cap"))).toEqual({ kind: "member", role: "officer" });
    expect(await c.leaveCrew(uid("cap"), crewId)).toEqual({ ok: true });
    expect(await count(crewId)).toBe(3);
  });

  it("promotes the next in line when a captain's account is deleted", async () => {
    // off is captain now; late and deck are deckhands who joined in the same transaction.
    await db()
      .delete(schema.creatorProfile)
      .where(eq(schema.creatorProfile.userId, uid("off")));
    expect(await count(crewId)).toBe(2);
    const roles = (await c.listCrewMembers(crewId)).map((m) => m.role);
    expect(roles).toEqual(["captain", "deckhand"]);
  });

  it("lets staff disband a crew and logs it; others can't", async () => {
    const deckhand = (await c.listCrewMembers(crewId)).find((m) => m.role === "deckhand")!;
    expect(await c.disbandCrew({ id: deckhand.userId, roles: ["user"] }, crewId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await c.disbandCrew({ id: uid("staff"), roles: ["mod"] }, crewId)).toEqual({ ok: true });
    expect(await c.getCrewBySlug(slug("crew2"))).toBeNull();
    const log = await db()
      .select()
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.actorUserId, uid("staff")), eq(schema.auditLog.targetId, crewId)),
      );
    expect(log[0]?.action).toBe("crew.disband");
  });

  it("removes a crew when its last member leaves", async () => {
    const r = await c.createCrew(uid("solo"), {
      slug: slug("solo"),
      name: "Solo",
      joinPolicy: "open",
    });
    if (!r.ok || !("crew" in r)) throw new Error("create failed");
    expect(await c.leaveCrew(uid("solo"), r.crew.id)).toEqual({ ok: true });
    expect(await c.getCrewBySlug(slug("solo"))).toBeNull();
  });
});
