import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Against the local Postgres and Redis. Skipped without DATABASE_URL. */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("notifications (Postgres + Redis)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { like } = await import("drizzle-orm");
  const n = await import("../src/notifications");

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uid = (x: string) => `test-${run}-${x}`;

  beforeAll(async () => {
    for (const x of ["amy", "bo"])
      await db()
        .insert(schema.user)
        .values({ id: uid(x), name: x, email: `${uid(x)}@example.test`, updatedAt: new Date() });
  });
  afterAll(async () => {
    await db()
      .delete(schema.user)
      .where(like(schema.user.id, `test-${run}-%`));
  });

  it("stores, collapses repeats while unread, and skips your own actions", async () => {
    const follow = {
      userId: uid("amy"),
      kind: "new_follower" as const,
      actorId: uid("bo"),
      data: { handle: "bo", name: "Bo" },
      dedupeKey: `follow:${uid("bo")}`,
    };
    expect(await n.insertNotifications([follow])).toEqual([uid("amy")]);
    expect(await n.insertNotifications([follow])).toEqual([]);
    expect(await n.insertNotifications([{ ...follow, userId: uid("bo") }])).toEqual([]);
    expect(await n.unreadCount(uid("amy"))).toBe(1);

    const { items } = await n.listNotifications(uid("amy"));
    expect(items[0]).toMatchObject({ kind: "new_follower", read: false, actor: { name: "bo" } });
  });

  it("marks read, then the same event can notify again", async () => {
    await n.markRead(uid("amy"));
    expect(await n.unreadCount(uid("amy"))).toBe(0);
    await n.notify([
      {
        userId: uid("amy"),
        kind: "new_follower",
        actorId: uid("bo"),
        data: { handle: "bo", name: "Bo" },
        dedupeKey: `follow:${uid("bo")}`,
      },
    ]);
    expect(await n.unreadCount(uid("amy"))).toBe(1);
    const { items } = await n.listNotifications(uid("amy"));
    await n.markRead(uid("amy"), [items[0]!.id]);
    expect(await n.unreadCount(uid("amy"))).toBe(0);
  });

  it("pages newest first", async () => {
    for (let i = 0; i < 3; i++)
      await n.notify([
        { userId: uid("bo"), kind: "crew_accepted", data: { slug: `s${i}`, crew: `C${i}` } },
      ]);
    const first = await n.listNotifications(uid("bo"), { limit: 2 });
    expect(first.items.map((i) => (i.data as { crew: string }).crew)).toEqual(["C2", "C1"]);
    expect(first.hasMore).toBe(true);
    const rest = await n.listNotifications(uid("bo"), { before: first.items[1]!.id });
    expect(rest.items.map((i) => (i.data as { crew: string }).crew)).toEqual(["C0"]);
  });

  it("pings open tabs when something changes", async () => {
    let pings = 0;
    const stop = await n.subscribeNotifications(uid("bo"), () => pings++);
    await n.notify([{ userId: uid("bo"), kind: "crew_accepted", data: { slug: "x", crew: "X" } }]);
    await new Promise((r) => setTimeout(r, 300));
    await stop();
    expect(pings).toBe(1);
  });
});
