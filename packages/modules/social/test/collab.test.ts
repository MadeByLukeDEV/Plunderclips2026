import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Crew board, sessions and looking-for-crew posts against Postgres + Redis. */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("collab (Postgres + Redis)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { and, eq, like } = await import("drizzle-orm");
  const crews = await import("../src/crews");
  const c = await import("../src/collab");
  const lfc = await import("../src/lfc");
  const chat = await import("../src/chat");
  const { listNotifications } = await import("@plunderclips/notifications");

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uid = (x: string) => `test-${run}-${x}`;
  const handle = (x: string) => `t${run}${x}`.slice(0, 24);
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);
  let crewId = "";

  beforeAll(async () => {
    for (const x of ["cap", "deck", "out", "mod"]) {
      await db()
        .insert(schema.user)
        .values({
          id: uid(x),
          name: x,
          email: `${uid(x)}@example.test`,
          role: x === "mod" ? "mod" : "user",
          updatedAt: new Date(),
        });
      await db()
        .insert(schema.creatorProfile)
        .values({ userId: uid(x), handle: handle(x), displayName: x.toUpperCase() });
    }
    const r = await crews.createCrew(uid("cap"), { slug: handle("crew"), name: "Planners", joinPolicy: "open" });
    if (!r.ok || !("crew" in r)) throw new Error("crew");
    crewId = r.crew.id;
    await crews.joinCrew(uid("deck"), crewId);
  });

  afterAll(async () => {
    await db().delete(schema.crew).where(like(schema.crew.slug, `t${run}%`));
    await db().delete(schema.auditLog).where(eq(schema.auditLog.actorUserId, uid("mod")));
    await db().delete(schema.user).where(like(schema.user.id, `test-${run}-%`));
  });

  it("keeps the board to members; authors and leads edit", async () => {
    expect(await c.addBoardItem(uid("out"), crewId, { title: "Spy" })).toEqual({ ok: false, error: "forbidden" });
    expect(await c.listBoard(crewId, uid("out"))).toBeNull();
    const idea = await c.addBoardItem(uid("deck"), crewId, { title: "  Kraken   speedrun ", notes: "Saturday?" });
    if (!idea.ok) throw new Error("add");
    expect(await c.addBoardItem(uid("deck"), crewId, { title: "   " })).toEqual({ ok: false, error: "invalid" });
    const capIdea = await c.addBoardItem(uid("cap"), crewId, { title: "Fort of Fortune", status: "planned" });
    if (!capIdea.ok) throw new Error("add");

    // The deckhand can't move the captain's item; the captain can move anyone's.
    expect(await c.updateBoardItem(uid("deck"), capIdea.id, { status: "done" })).toEqual({ ok: false, error: "forbidden" });
    expect(await c.updateBoardItem(uid("cap"), idea.id, { status: "planned" })).toMatchObject({ ok: true });
    expect(await c.updateBoardItem(uid("cap"), idea.id, { status: "someday" })).toEqual({ ok: false, error: "invalid" });
    const board = (await c.listBoard(crewId, uid("deck")))!;
    expect(board.find((b) => b.id === idea.id)).toMatchObject({ title: "Kraken speedrun", status: "planned", authorName: "DECK" });
    expect(await c.deleteBoardItem(uid("deck"), idea.id)).toMatchObject({ ok: true });
  });

  it("lets leads schedule sessions, tells the crew, and takes RSVPs", async () => {
    expect(await c.createSession(uid("deck"), crewId, { title: "Mine", startsAt: inDays(1) })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await c.createSession(uid("cap"), crewId, { title: "Too far", startsAt: inDays(400) })).toEqual({
      ok: false,
      error: "invalid",
    });
    const s = await c.createSession(uid("cap"), crewId, {
      title: "Hourglass night",
      startsAt: inDays(2).toISOString(),
      durationMin: 180,
      isPublic: true,
    });
    if (!s.ok) throw new Error("session");
    const secret = await c.createSession(uid("cap"), crewId, { title: "Secret plan", startsAt: inDays(3) });
    if (!secret.ok) throw new Error("session");

    const note = (await listNotifications(uid("deck"), { limit: 1 })).items[0];
    expect(note).toMatchObject({ kind: "session_scheduled", data: { sessionId: secret.id, title: "Secret plan" } });

    expect(await c.rsvp(uid("out"), s.id, "going")).toEqual({ ok: false, error: "forbidden" });
    expect(await c.rsvp(uid("deck"), s.id, "maybe")).toMatchObject({ ok: true });
    expect(await c.rsvp(uid("deck"), s.id, "going")).toMatchObject({ ok: true });

    const range = { from: new Date(), to: inDays(30) };
    const member = await c.listSessions(crewId, uid("deck"), range);
    expect(member.map((x) => x.title)).toEqual(["Hourglass night", "Secret plan"]);
    expect(member[0]!.going.map((g) => g.name)).toEqual(["DECK"]);
    // Outsiders and signed-out visitors only see public sessions.
    expect((await c.listSessions(crewId, uid("out"), range)).map((x) => x.title)).toEqual(["Hourglass night"]);
    expect((await c.listSessions(crewId, null, range)).map((x) => x.title)).toEqual(["Hourglass night"]);
    expect((await c.nextPublicSessions(crewId)).map((x) => x.title)).toEqual(["Hourglass night"]);

    expect(await c.deleteSession(uid("deck"), secret.id)).toEqual({ ok: false, error: "forbidden" });
    expect(await c.deleteSession(uid("cap"), secret.id)).toMatchObject({ ok: true });
  });

  it("opens looking-for-crew posts, filters them, and caps open posts at three", async () => {
    expect(await lfc.createLfcPost(uid("deck"), { title: "Recruit", crewId })).toEqual({ ok: false, error: "forbidden" });
    const crewPost = await lfc.createLfcPost(uid("cap"), {
      title: "Planners recruiting",
      crewId,
      region: "eu",
      platform: "pc",
      ship: "galleon",
      styles: ["hourglass", "pvp", "not-a-style"],
      availability: "Weekends CET",
    });
    if (!crewPost.ok) throw new Error("post");
    const solo = await lfc.createLfcPost(uid("out"), { title: "Chill sailor", region: "any", styles: ["chill"] });
    if (!solo.ok) throw new Error("post");

    const mine = (list: { id: string }[]) => list.filter((p) => [crewPost.id, solo.id].includes(p.id)).map((p) => p.id);
    expect(mine(await lfc.listLfcPosts({ region: "eu" }, 100))).toEqual([solo.id, crewPost.id]);
    expect(mine(await lfc.listLfcPosts({ region: "na" }, 100))).toEqual([solo.id]);
    expect(mine(await lfc.listLfcPosts({ style: "hourglass" }, 100))).toEqual([crewPost.id]);
    const shown = (await lfc.listLfcPosts({}, 100)).find((p) => p.id === crewPost.id)!;
    expect(shown).toMatchObject({ styles: ["hourglass", "pvp"], crew: { name: "Planners" }, author: { name: "CAP" } });

    for (const t of ["b", "c"]) await lfc.createLfcPost(uid("out"), { title: t });
    expect(await lfc.createLfcPost(uid("out"), { title: "fourth" })).toEqual({ ok: false, error: "too_many" });

    // Expired posts drop off the list.
    await db().update(schema.lfcPost).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.lfcPost.id, solo.id));
    expect(mine(await lfc.listLfcPosts({}, 100))).toEqual([crewPost.id]);
  });

  it("lets anyone message a creator with an open post", async () => {
    // "mod" doesn't follow and isn't a crewmate, but cap has an open post.
    expect(await chat.canMessage(uid("mod"), uid("cap"))).toBe(true);
    await db().delete(schema.lfcPost).where(eq(schema.lfcPost.authorId, uid("cap")));
    expect(await chat.canMessage(uid("mod"), uid("cap"))).toBe(false);
  });

  it("lets authors close posts and staff remove them (logged)", async () => {
    const p = await lfc.createLfcPost(uid("deck"), { title: "Looking for a sloop buddy" });
    if (!p.ok) throw new Error("post");
    expect(await lfc.deleteLfcPost({ id: uid("cap"), roles: ["user"] }, p.id)).toEqual({ ok: false, error: "forbidden" });
    expect(await lfc.deleteLfcPost({ id: uid("mod"), roles: ["mod"] }, p.id)).toEqual({ ok: true });
    const log = await db()
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.actorUserId, uid("mod")), eq(schema.auditLog.action, "lfc.remove")));
    expect(log[0]).toMatchObject({ targetType: "lfc", targetId: p.id });
  });
});
