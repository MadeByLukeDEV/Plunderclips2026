import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Chat against the local Postgres and Redis (pnpm dev:services + db:migrate). Skipped without
 * DATABASE_URL. Every user, crew and channel it creates is deleted afterwards.
 */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("chat (Postgres + Redis)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { and, eq, inArray, like } = await import("drizzle-orm");
  const crews = await import("../src/crews");
  const chat = await import("../src/chat");
  const { subscribe } = await import("../src/chat-bus");
  const { createReport } = await import("@plunderclips/moderation");

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uid = (n: string) => `test-${run}-${n}`;
  const slug = (n: string) => `t${run}${n}`.slice(0, 24);
  const people = ["ann", "ben", "cat", "dan", "staff"];
  let crewId = "";
  let crewChannel = "";

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
      await db()
        .insert(schema.creatorProfile)
        .values({ userId: uid(n), handle: slug(`u${n}`), displayName: n.toUpperCase() });
    }
    const r = await crews.createCrew(uid("ann"), {
      slug: slug("crew"),
      name: "Chatters",
      joinPolicy: "open",
    });
    if (!r.ok || !("crew" in r)) throw new Error("crew");
    crewId = r.crew.id;
    await crews.joinCrew(uid("ben"), crewId);
  });

  afterAll(async () => {
    const mine = await db()
      .select({ id: schema.chatParticipant.channelId })
      .from(schema.chatParticipant)
      .where(like(schema.chatParticipant.userId, `test-${run}-%`));
    if (mine.length)
      await db()
        .delete(schema.chatChannel)
        .where(inArray(schema.chatChannel.id, [...new Set(mine.map((m) => m.id))]));
    await db()
      .delete(schema.crew)
      .where(like(schema.crew.slug, `t${run}%`));
    await db()
      .delete(schema.report)
      .where(like(schema.report.reporterKey, `u:test-${run}-%`));
    await db()
      .delete(schema.auditLog)
      .where(eq(schema.auditLog.actorUserId, uid("staff")));
    await db()
      .delete(schema.user)
      .where(like(schema.user.id, `test-${run}-%`));
  });

  it("opens the crew channel to members only", async () => {
    crewChannel = await chat.crewChannelId(crewId);
    expect(await chat.crewChannelId(crewId)).toBe(crewChannel);
    expect(await chat.channelFor(crewChannel, uid("ben"))).toMatchObject({
      kind: "crew",
      title: "Chatters",
    });
    expect(await chat.channelFor(crewChannel, uid("cat"))).toBeNull();
    expect(await chat.channelFor("not-a-channel", uid("ann"))).toBeNull();
  });

  it("checks messages and pushes them to open streams", async () => {
    expect(await chat.sendMessage(uid("ann"), crewChannel, "   ")).toEqual({
      ok: false,
      error: "empty",
    });
    expect(await chat.sendMessage(uid("ann"), crewChannel, "x".repeat(2001))).toEqual({
      ok: false,
      error: "too_long",
    });
    expect(await chat.sendMessage(uid("cat"), crewChannel, "let me in")).toEqual({
      ok: false,
      error: "forbidden",
    });

    const seen: unknown[] = [];
    const stop = await subscribe(crewChannel, (e) => seen.push(e));
    const sent = await chat.sendMessage(uid("ann"), crewChannel, "Ahoy\r\n\r\n\r\n\r\ncrew");
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.message.body).toBe("Ahoy\n\ncrew");
    await new Promise((r) => setTimeout(r, 300));
    await stop();
    expect(seen).toEqual([{ type: "message", message: chat.toWire(sent.message) }]);
  });

  it("counts unread messages from others until they're read", async () => {
    await chat.sendMessage(uid("ann"), crewChannel, "second");
    const inbox = await chat.listInbox(uid("ben"));
    expect(inbox.find((i) => i.channelId === crewChannel)?.unread).toBe(2);
    expect(
      (await chat.listInbox(uid("ann"))).find((i) => i.channelId === crewChannel)?.unread,
    ).toBe(0);
    const { messages } = await chat.listMessages(crewChannel);
    await chat.markRead(uid("ben"), crewChannel, messages.at(-1)!.id);
    expect(await chat.unreadTotal(uid("ben"))).toBe(0);
  });

  it("pages history and catches up a reconnecting stream", async () => {
    const all = (await chat.listMessages(crewChannel)).messages;
    expect(all.map((m) => m.body)).toEqual(["Ahoy\n\ncrew", "second"]);
    const older = await chat.listMessages(crewChannel, { before: all[1]!.id, limit: 1 });
    expect(older.messages.map((m) => m.body)).toEqual(["Ahoy\n\ncrew"]);
    const missed = await chat.listMessages(crewChannel, { after: all[0]!.id });
    expect(missed.messages.map((m) => m.body)).toEqual(["second"]);
  });

  it("lets a member start a conversation with crewmates or followers only", async () => {
    expect(await chat.openDm(uid("ann"), uid("ann"))).toEqual({ ok: false, error: "self" });
    expect(await chat.openDm(uid("ann"), uid("cat"))).toEqual({ ok: false, error: "not_allowed" });
    expect(await chat.canMessage(uid("ann"), uid("cat"))).toBe(false);

    // Cat follows Ann: Ann may write to Cat.
    await db()
      .insert(schema.creatorFollow)
      .values({ followerId: uid("cat"), creatorId: uid("ann") });
    const dm = await chat.openDm(uid("ann"), uid("cat"));
    expect(dm.ok).toBe(true);
    if (!dm.ok) return;
    expect(await chat.openDm(uid("cat"), uid("ann"))).toEqual(dm);

    // Crewmates can always talk.
    expect((await chat.openDm(uid("ben"), uid("ann"))).ok).toBe(true);

    expect(await chat.channelFor(dm.channelId, uid("cat"))).toMatchObject({
      kind: "dm",
      title: "ANN",
    });
    expect(await chat.channelFor(dm.channelId, uid("ben"))).toBeNull();

    // An empty conversation stays out of the inbox until someone writes.
    expect((await chat.listInbox(uid("cat"))).some((i) => i.channelId === dm.channelId)).toBe(
      false,
    );
    await chat.sendMessage(uid("ann"), dm.channelId, "Thanks for the follow");
    expect(
      (await chat.listInbox(uid("cat"))).find((i) => i.channelId === dm.channelId)?.unread,
    ).toBe(1);
  });

  it("lets authors and staff remove messages, and logs staff removals", async () => {
    const own = await chat.sendMessage(uid("ben"), crewChannel, "oops");
    const rude = await chat.sendMessage(uid("ben"), crewChannel, "something rude");
    if (!own.ok || !rude.ok) throw new Error("send");

    expect(await chat.deleteMessage({ id: uid("ann"), roles: ["user"] }, own.message.id)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await chat.deleteMessage({ id: uid("ben"), roles: ["user"] }, own.message.id)).toEqual({
      ok: true,
    });
    expect(await chat.deleteMessage({ id: uid("staff"), roles: ["mod"] }, rude.message.id)).toEqual(
      { ok: true },
    );

    const removed = (await chat.listMessages(crewChannel)).messages.filter((m) => m.deleted);
    expect(removed.map((m) => [m.body, m.deleted])).toEqual([
      ["", "author"],
      ["", "staff"],
    ]);
    const log = await db()
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.actorUserId, uid("staff")),
          eq(schema.auditLog.action, "message.remove"),
        ),
      );
    expect(log[0]?.meta).toMatchObject({ excerpt: "something rude" });
  });

  it("takes message reports only from people who can see the message", async () => {
    const m = await chat.sendMessage(uid("ben"), crewChannel, "report me");
    if (!m.ok) throw new Error("send");
    const target = {
      targetType: "message" as const,
      targetId: String(m.message.id),
      reason: "spam",
    };
    expect(await createReport({ userId: uid("cat") }, target)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await createReport({ ipHash: "abc" }, target)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await createReport({ userId: uid("ann") }, target)).toEqual({
      ok: true,
      duplicate: false,
    });
  });

  it("refuses messages from banned members", async () => {
    await db()
      .update(schema.user)
      .set({ banned: true })
      .where(eq(schema.user.id, uid("ben")));
    expect(await chat.sendMessage(uid("ben"), crewChannel, "still here")).toEqual({
      ok: false,
      error: "banned",
    });
  });
});
