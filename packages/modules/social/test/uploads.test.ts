import { crc32, deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** A solid-colour PNG of the given size, built by hand so this package doesn't need sharp. */
function solidPng(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x9c)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Crew and profile image uploads against Postgres, with an in-memory store instead of R2. */
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("image uploads (Postgres)", async () => {
  Object.assign(process.env, {
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    MEDIA_DRIVER: "local",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { and, eq, like } = await import("drizzle-orm");
  const { setStorageForTests } = await import("@plunderclips/media");
  const crews = await import("../src/crews");
  const { setProfileBannerImage, clearProfileBannerImage, getProfileByUser } =
    await import("@plunderclips/creators");

  const files = new Map<string, Buffer>();
  setStorageForTests({
    put: async (k, d) => void files.set(k, d),
    remove: async (k) => void files.delete(k),
  });

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uid = (x: string) => `test-${run}-${x}`;
  const handle = (x: string) => `t${run}${x}`.slice(0, 24);
  const image = async (w: number, h: number) => solidPng(w, h);
  let crewId = "";

  beforeAll(async () => {
    for (const x of ["cap", "deck", "mod"]) {
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
        .values({ userId: uid(x), handle: handle(x), displayName: x });
    }
    const r = await crews.createCrew(uid("cap"), {
      slug: handle("crew"),
      name: "Pics",
      joinPolicy: "open",
    });
    if (!r.ok || !("crew" in r)) throw new Error("crew");
    crewId = r.crew.id;
    await crews.joinCrew(uid("deck"), crewId);
  });

  afterAll(async () => {
    setStorageForTests(null);
    await db()
      .delete(schema.crew)
      .where(like(schema.crew.slug, `t${run}%`));
    await db()
      .delete(schema.auditLog)
      .where(eq(schema.auditLog.actorUserId, uid("mod")));
    await db()
      .delete(schema.user)
      .where(like(schema.user.id, `test-${run}-%`));
  });

  it("lets only the captain set the crew logo, and replaces the old file", async () => {
    expect(await crews.setCrewImage(uid("deck"), crewId, "logo", await image(300, 300))).toEqual({
      ok: false,
      error: "forbidden",
    });
    const first = await crews.setCrewImage(uid("cap"), crewId, "logo", await image(300, 300));
    const second = await crews.setCrewImage(uid("cap"), crewId, "logo", await image(400, 400));
    if (!first.ok || !second.ok) throw new Error("upload");
    expect(second.url).toMatch(/^\/media\/logos\/crew\/.+\.webp$/);
    expect(files.size).toBe(1);
    expect([...files.keys()][0]).toBe(second.url.slice("/media/".length));
    expect((await crews.getCrewBySlug(handle("crew")))?.logoUrl).toBe(second.url);
  });

  it("refuses what isn't a usable image", async () => {
    expect(
      await crews.setCrewImage(uid("cap"), crewId, "banner", Buffer.from("GIF89a nope")),
    ).toEqual({
      ok: false,
      error: "not_an_image",
    });
    expect(await crews.setCrewImage(uid("cap"), crewId, "banner", await image(200, 100))).toEqual({
      ok: false,
      error: "too_small",
    });
  });

  it("lets staff take a crew image down, and logs it", async () => {
    expect(
      await crews.clearCrewImage({ id: uid("deck"), roles: ["user"] }, crewId, "logo"),
    ).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(
      await crews.clearCrewImage({ id: uid("mod"), roles: ["mod"] }, crewId, "logo"),
    ).toMatchObject({ ok: true });
    expect(files.size).toBe(0);
    const log = await db()
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.actorUserId, uid("mod")),
          eq(schema.auditLog.action, "image.remove"),
        ),
      );
    expect(log[0]).toMatchObject({ targetType: "crew", targetId: crewId });
  });

  it("sets and clears a profile banner; others can't clear it", async () => {
    const r = await setProfileBannerImage(uid("deck"), await image(2000, 800));
    if (!r.ok) throw new Error(r.error);
    expect((await getProfileByUser(uid("deck")))?.bannerUrl).toBe(r.url);
    expect(await clearProfileBannerImage({ id: uid("cap"), roles: ["user"] }, uid("deck"))).toEqual(
      {
        ok: false,
        error: "forbidden",
      },
    );
    expect(
      await clearProfileBannerImage({ id: uid("deck"), roles: ["user"] }, uid("deck")),
    ).toEqual({ ok: true });
    expect((await getProfileByUser(uid("deck")))?.bannerUrl).toBeNull();
  });
});
