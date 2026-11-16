import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Notifications raised by crews, chat mentions and follows, against Postgres and Redis. */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("notification flows (Postgres + Redis)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { like } = await import("drizzle-orm");
  const crews = await import("../src/crews");
  const chat = await import("../src/chat");
  const { setFollow } = await import("@plunderclips/creators");
  const { listNotifications, unreadCount } = await import("@plunderclips/notifications");

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uid = (x: string) => `test-${run}-${x}`;
  const handle = (x: string) => `t${run}${x}`.slice(0, 24);
  const latest = async (who: string) => (await listNotifications(uid(who), { limit: 1 })).items[0];
  let crewId = "";

  beforeAll(async () => {
    for (const x of ["cap", "off", "ask", "out"]) {
      await db()
        .insert(schema.user)
        .values({ id: uid(x), name: x, email: `${uid(x)}@example.test`, updatedAt: new Date() });
      await db()
        .insert(schema.creatorProfile)
        .values({ userId: uid(x), handle: handle(x), displayName: x.toUpperCase() });
    }
    const r = await crews.createCrew(uid("cap"), { slug: handle("crew"), name: "Bell Crew" });
    if (!r.ok || !("crew" in r)) throw new Error("crew");
    crewId = r.crew.id;
    await crews.joinCrew(uid("off"), crewId);
    await crews.answerRequest(uid("cap"), crewId, uid("off"), true);
    await crews.setCrewRole(uid("cap"), crewId, uid("off"), "officer");
  });

  afterAll(async () => {
    await db()
      .delete(schema.crew)
      .where(like(schema.crew.slug, `t${run}%`));
    await db()
      .delete(schema.user)
      .where(like(schema.user.id, `test-${run}-%`));
  });

  it("tells the captain and officers about a request, and the asker when they're let in", async () => {
    await crews.joinCrew(uid("ask"), crewId, "hi");
    for (const who of ["cap", "off"])
      expect(await latest(who)).toMatchObject({
        kind: "crew_request",
        data: { slug: handle("crew"), crew: "Bell Crew", name: "ASK" },
      });
    await crews.answerRequest(uid("off"), crewId, uid("ask"), true);
    expect(await latest("ask")).toMatchObject({
      kind: "crew_accepted",
      data: { crew: "Bell Crew" },
    });
  });

  it("notifies people @mentioned who can read the channel, not outsiders or the author", async () => {
    const channel = await chat.crewChannelId(crewId);
    const before = await unreadCount(uid("out"));
    const sent = await chat.sendMessage(
      uid("cap"),
      channel,
      `Ahoy @${handle("ask")} and @${handle("out")}, also me @${handle("cap")} and mail@${handle("off")}`,
    );
    if (!sent.ok) throw new Error("send");
    expect(await latest("ask")).toMatchObject({
      kind: "mention",
      data: {
        channelId: channel,
        messageId: String(sent.message.id),
        where: "Bell Crew",
        name: "CAP",
      },
    });
    // Not in the crew, the author themself, and an email-looking token don't notify.
    expect(await unreadCount(uid("out"))).toBe(before);
    expect((await latest("cap"))?.kind).not.toBe("mention");
    expect((await latest("off"))?.kind).not.toBe("mention");
    expect(chat.mentionedHandles("hey @Ab_cd- and @x")).toEqual(["ab_cd"]);
  });

  it("tells a creator about a new follower once, however often they re-follow", async () => {
    const before = await unreadCount(uid("cap"));
    await setFollow(uid("out"), uid("cap"), true);
    await setFollow(uid("out"), uid("cap"), false);
    await setFollow(uid("out"), uid("cap"), true);
    expect(await unreadCount(uid("cap"))).toBe(before + 1);
    expect(await latest("cap")).toMatchObject({ kind: "new_follower", data: { name: "OUT" } });
  });
});
