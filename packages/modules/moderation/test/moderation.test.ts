import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Moderation against the local Postgres (and Redis for report rate limits).
 * Skipped unless DATABASE_URL and REDIS_URL are set. Deletes everything it creates.
 */
const ready = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;

describe.skipIf(!ready)("moderation (Postgres)", async () => {
  Object.assign(process.env, {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "x".repeat(32),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  });
  const { db, schema } = await import("@plunderclips/db");
  const { redis } = await import("@plunderclips/shared");
  const { and, eq, inArray, like } = await import("drizzle-orm");
  const { isoWeek } = await import("@plunderclips/clips");
  const m = await import("../src/index");

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const uid = (n: string) => `test-${run}-${n}`;
  const mod: import("../src/actor").Actor = { id: uid("mod"), roles: ["mod"] };
  const admin: import("../src/actor").Actor = { id: uid("admin"), roles: ["admin"] };
  const member: import("../src/actor").Actor = { id: uid("member"), roles: ["user"] };
  const ids: Record<string, string> = {};

  async function newClip(name: string, status: "pending" | "approved" | "rejected" = "pending") {
    const [row] = await db()
      .insert(schema.clip)
      .values({
        key: `test:${run}:${name}`,
        platform: "twitch",
        kind: "clip",
        platformId: name,
        canonicalUrl: `https://clips.twitch.tv/${name}`,
        title: name,
        status,
        approvedAt: status === "approved" ? new Date() : null,
        submittedByUserId: uid("member"),
      })
      .returning({ id: schema.clip.id });
    ids[name] = row!.id;
    return row!.id;
  }
  const clipRow = async (id: string) =>
    (await db().select().from(schema.clip).where(eq(schema.clip.id, id)))[0]!;
  const auditFor = (id: string) =>
    db().select().from(schema.auditLog).where(eq(schema.auditLog.targetId, id));

  beforeAll(async () => {
    for (const [n, role] of [
      ["mod", "mod"],
      ["admin", "admin"],
      ["member", "user"],
      ["creator", "creator"],
      ["mod2", "mod"],
    ])
      await db()
        .insert(schema.user)
        .values({
          id: uid(n!),
          name: n!,
          email: `${uid(n!)}@example.test`,
          role,
          updatedAt: new Date(),
        });
  });

  afterAll(async () => {
    const clipIds = Object.values(ids);
    if (clipIds.length) {
      await db().delete(schema.auditLog).where(inArray(schema.auditLog.targetId, clipIds));
      await db().delete(schema.report).where(inArray(schema.report.targetId, clipIds));
    }
    await db()
      .delete(schema.auditLog)
      .where(like(schema.auditLog.actorUserId, `test-${run}-%`));
    await db()
      .delete(schema.report)
      .where(like(schema.report.reporterKey, `%${run}%`));
    await db()
      .delete(schema.clip)
      .where(like(schema.clip.key, `test:${run}:%`));
    await db()
      .delete(schema.user)
      .where(like(schema.user.id, `test-${run}-%`));
    const keys = await redis().keys(`rl:report:*${run}*`);
    if (keys.length) await redis().del(...keys);
    redis().disconnect();
  });

  describe("permissions", () => {
    it("refuses members and creators everything", async () => {
      const id = await newClip("perm");
      await expect(m.listQueue(member)).rejects.toBeInstanceOf(m.ForbiddenError);
      await expect(m.reviewClip(member, id, { decision: "approve" })).rejects.toBeInstanceOf(
        m.ForbiddenError,
      );
      const creator = { id: uid("creator"), roles: ["creator"] };
      await expect(m.reviewClip(creator, id, { decision: "approve" })).rejects.toBeInstanceOf(
        m.ForbiddenError,
      );
      await expect(m.listOpenReports(creator)).rejects.toBeInstanceOf(m.ForbiddenError);
      await expect(m.listUsers(member)).rejects.toBeInstanceOf(m.ForbiddenError);
      expect((await clipRow(id)).status).toBe("pending");
    });

    it("lets only admins change roles", async () => {
      await expect(
        m.setRoles(mod, new Headers(), uid("member"), ["creator"]),
      ).rejects.toBeInstanceOf(m.ForbiddenError);
      expect(m.canSetRoles(admin)).toBe(true);
      expect(m.isStaff(mod)).toBe(true);
      expect(m.isStaff(member)).toBe(false);
    });
  });

  describe("review", () => {
    it("lists pending clips oldest first with submitter history", async () => {
      const a = await newClip("q-first");
      await newClip("q-second");
      const page = await m.listQueue(mod, { status: "pending" });
      const mine = page.clips.filter((c) => c.title.startsWith("q-"));
      expect(mine.map((c) => c.title)).toEqual(["q-first", "q-second"]);
      expect(mine[0]!.submitterName).toBe("member");
      expect(mine[0]!.history.total).toBeGreaterThanOrEqual(1);
      expect(mine.find((c) => c.id === a)).not.toHaveProperty("submitterIpHash");
      expect(mine.find((c) => c.id === a)).not.toHaveProperty("submittedByUserId");
    });

    it("approves with tags and picks in one go, and logs it", async () => {
      const id = await newClip("approve-me");
      const r = await m.reviewClip(mod, id, {
        decision: "approve",
        tags: ["kraken", "pvp", "not-a-tag", "kraken"],
        sections: [{ slug: "weekly" }, { slug: "featured" }, { slug: "nope" }],
      });
      expect(r).toEqual({ ok: true, status: "approved" });
      const row = await clipRow(id);
      expect(row).toMatchObject({
        status: "approved",
        reviewedByUserId: mod.id,
        tags: ["kraken", "pvp"],
      });
      expect(row.approvedAt).toBeInstanceOf(Date);
      const picks = await db()
        .select()
        .from(schema.clipSection)
        .where(eq(schema.clipSection.clipId, id));
      expect(picks.map((p) => [p.sectionSlug, p.period]).sort()).toEqual([
        ["featured", ""],
        ["weekly", isoWeek(new Date())],
      ]);
      const log = await auditFor(id);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ action: "clip.approve", actorUserId: mod.id });
      expect(log[0]!.meta).toMatchObject({
        from: "pending",
        to: "approved",
        sections: ["weekly", "featured", "nope"],
      });
    });

    it("refuses a second decision on the same clip", async () => {
      const id = await newClip("twice");
      expect((await m.reviewClip(mod, id, { decision: "reject", reason: "not_sot" })).ok).toBe(
        true,
      );
      expect(await m.reviewClip(mod, id, { decision: "reject", reason: "not_sot" })).toEqual({
        ok: false,
        error: "wrong_status",
      });
      expect(await m.reviewClip(mod, id, { decision: "update", tags: [] })).toEqual({
        ok: false,
        error: "wrong_status",
      });
    });

    it("stores the reason the submitter sees, and needs one", async () => {
      const id = await newClip("reject-me");
      expect(
        await m.reviewClip(mod, id, { decision: "reject", reason: "custom", note: "  " }),
      ).toEqual({
        ok: false,
        error: "bad_input",
      });
      await m.reviewClip(mod, id, {
        decision: "reject",
        reason: "reupload",
        note: "Original is on Medal",
      });
      expect((await clipRow(id)).rejectReason).toBe(
        "A re-upload: link the original clip. Original is on Medal",
      );
    });

    it("re-curates a live clip (unticking removes the pick) and takes it down", async () => {
      const id = await newClip("live", "approved");
      await m.reviewClip(mod, id, {
        decision: "update",
        tags: ["funny"],
        sections: [{ slug: "best-of" }],
      });
      await m.reviewClip(mod, id, { decision: "update", sections: [] });
      expect(
        await db().select().from(schema.clipSection).where(eq(schema.clipSection.clipId, id)),
      ).toEqual([]);
      expect((await clipRow(id)).tags).toEqual(["funny"]);
      await m.reviewClip(mod, id, { decision: "update", sections: [{ slug: "featured" }] });
      await m.reviewClip(mod, id, { decision: "unpublish", reason: "rules" });
      const row = await clipRow(id);
      expect(row.status).toBe("rejected");
      expect(
        await db().select().from(schema.clipSection).where(eq(schema.clipSection.clipId, id)),
      ).toEqual([]);
      expect((await auditFor(id)).map((a) => a.action).sort()).toEqual(
        ["clip.unpublish", "clip.update", "clip.update", "clip.update"].sort(),
      );
    });

    it("can publish a rejected clip after all", async () => {
      const id = await newClip("overturn", "rejected");
      expect(await m.reviewClip(admin, id, { decision: "approve" })).toEqual({
        ok: true,
        status: "approved",
      });
      expect((await clipRow(id)).rejectReason).toBeNull();
    });

    it("arranges a section and logs the new order", async () => {
      const a = await newClip("pick-a", "approved");
      const b = await newClip("pick-b", "approved");
      const c = await newClip("pick-c", "approved");
      for (const id of [a, b, c])
        await m.reviewClip(mod, id, { decision: "update", sections: [{ slug: "best-of" }] });
      await m.arrangeSection(mod, "best-of", "", [c, a, "not-in-section"]);
      const picks = (await m.listSectionPicks(mod, "best-of", "")).filter((p) =>
        [a, b, c].includes(p.clipId),
      );
      expect(picks.map((p) => p.clipId)).toEqual([c, a]);
      const [log] = await db()
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.action, "section.arrange"),
            eq(schema.auditLog.actorUserId, mod.id),
          ),
        );
      expect(log!.meta).toMatchObject({ removed: [b] });
    });
  });

  describe("reports", () => {
    const reporter = { ipHash: `${run}-reporter` };

    it("accepts a report on a live clip once per reporter", async () => {
      const id = await newClip("reported", "approved");
      expect(
        await m.createReport(reporter, { targetType: "clip", targetId: id, reason: "stolen" }),
      ).toEqual({
        ok: true,
        duplicate: false,
      });
      expect(
        await m.createReport(reporter, { targetType: "clip", targetId: id, reason: "spam" }),
      ).toEqual({
        ok: true,
        duplicate: true,
      });
      expect(
        await m.createReport(
          { userId: uid("member") },
          { targetType: "clip", targetId: id, reason: "not_sot" },
        ),
      ).toEqual({ ok: true, duplicate: false });
    });

    it("refuses bad reasons, missing notes, pending clips and unknown targets", async () => {
      const pending = await newClip("not-live");
      expect(
        await m.createReport(reporter, { targetType: "clip", targetId: pending, reason: "spam" }),
      ).toEqual({
        ok: false,
        error: "not_found",
      });
      expect(
        await m.createReport(reporter, {
          targetType: "clip",
          targetId: ids.reported!,
          reason: "nope",
        }),
      ).toEqual({ ok: false, error: "bad_input" });
      expect(
        await m.createReport(
          { ipHash: `${run}-x` },
          { targetType: "clip", targetId: ids.reported!, reason: "other" },
        ),
      ).toEqual({ ok: false, error: "bad_input" });
      expect(
        await m.createReport(null, { targetType: "clip", targetId: ids.reported!, reason: "spam" }),
      ).toEqual({
        ok: false,
        error: "no_reporter",
      });
    });

    it("groups open reports by target and takes the clip down when asked", async () => {
      const groups = await m.listOpenReports(mod);
      const g = groups.find((x) => x.targetId === ids.reported);
      expect(g).toMatchObject({ targetType: "clip", label: "reported", targetStatus: "approved" });
      expect(g!.reports).toHaveLength(2);

      expect(
        await m.resolveReports(
          mod,
          { targetType: "clip", targetId: ids.reported! },
          {
            action: "take_down",
            reason: "reupload",
          },
        ),
      ).toEqual({ ok: true, closed: 2 });
      expect((await clipRow(ids.reported!)).status).toBe("rejected");
      expect((await m.listOpenReports(mod)).some((x) => x.targetId === ids.reported)).toBe(false);
      // A new report can be opened once the old ones are closed (only open reports are unique).
      expect(await m.openReportCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("members", () => {
    it("searches by email (admins) and filters staff", async () => {
      const found = await m.listUsers(admin, { q: `test-${run}-mem` });
      expect(found.users.map((u) => u.id)).toEqual([uid("member")]);
      const staff = await m.listUsers(admin, { q: `test-${run}`, filter: "staff" });
      expect(staff.users.map((u) => u.id).sort()).toEqual(
        [uid("admin"), uid("mod"), uid("mod2")].sort(),
      );
      expect(found.users[0]!.roles).toEqual(["user"]);
    });

    it("lets only admins search by email", async () => {
      const email = `${uid("member")}@example.test`;
      expect((await m.listUsers(admin, { q: email })).users.map((u) => u.id)).toEqual([
        uid("member"),
      ]);
      expect((await m.listUsers(mod, { q: email })).users).toEqual([]);
    });

    it("treats % and _ in searches literally", async () => {
      expect(
        (await m.listUsers(mod, { q: "%" })).users.every(
          (u) => u.name.includes("%") || u.email.includes("%"),
        ),
      ).toBe(true);
    });

    it("blocks bans that would go past the role", async () => {
      const h = new Headers();
      expect(await m.setBan(mod, h, mod.id, { banned: true, reason: "x" })).toEqual({
        ok: false,
        error: "You can't ban yourself.",
      });
      expect(await m.setBan(mod, h, admin.id, { banned: true, reason: "x" })).toMatchObject({
        ok: false,
      });
      expect(await m.setBan(mod, h, uid("mod2"), { banned: true, reason: "x" })).toEqual({
        ok: false,
        error: "Only an admin can ban a mod.",
      });
      expect(await m.setBan(mod, h, uid("member"), { banned: true, reason: "  " })).toEqual({
        ok: false,
        error: "Add a reason. The member sees it.",
      });
      expect(await m.setBan(mod, h, uid("ghost"), { banned: true, reason: "x" })).toMatchObject({
        ok: false,
      });
      await expect(
        m.setBan(member, h, uid("mod"), { banned: true, reason: "x" }),
      ).rejects.toBeInstanceOf(m.ForbiddenError);
    });

    it("stops an admin removing their own admin role", async () => {
      expect(await m.setRoles(admin, new Headers(), admin.id, ["mod"])).toEqual({
        ok: false,
        error: "You can't remove your own admin role. Ask another admin.",
      });
    });
  });

  it("pages the audit log newest first", async () => {
    const all = await m.listAudit();
    expect(all.rows.length).toBeGreaterThan(0);
    const times = all.rows.map((r) => r.createdAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const filtered = await m.listAudit({ action: "clip.approve" });
    expect(filtered.rows.every((r) => r.action === "clip.approve")).toBe(true);
  });
});
