import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { checkHandle, isBanner, type Banner, type HandleError } from "@plunderclips/creators";
import { audit, isStaff, type Actor } from "@plunderclips/moderation";

const { crew, crewMember, crewRequest, creatorProfile, user } = schema;

export const CREW_NAME_MAX = 40;
export const CREW_MOTTO_MAX = 160;
export const REQUEST_MESSAGE_MAX = 200;
/** Largest crew, and most crews one member can sail with. */
export const CREW_SIZE_MAX = 50;
export const CREWS_PER_MEMBER_MAX = 10;

export const JOIN_POLICIES = ["open", "request"] as const;
export type JoinPolicy = (typeof JOIN_POLICIES)[number];
export type CrewRole = "captain" | "officer" | "deckhand";

export type Crew = {
  id: string;
  slug: string;
  name: string;
  motto: string;
  banner: Banner;
  joinPolicy: JoinPolicy;
  memberCount: number;
  createdAt: Date;
};

export type CrewMember = {
  userId: string;
  handle: string;
  displayName: string;
  image: string | null;
  role: CrewRole;
  joinedAt: Date;
};

export type CrewRequest = {
  userId: string;
  handle: string;
  displayName: string;
  image: string | null;
  message: string;
  createdAt: Date;
};

/** Where the viewer stands with a crew. */
export type Standing =
  { kind: "member"; role: CrewRole } | { kind: "requested" } | { kind: "none" };

const crewColumns = {
  id: crew.id,
  slug: crew.slug,
  name: crew.name,
  motto: crew.motto,
  banner: crew.banner,
  joinPolicy: crew.joinPolicy,
  memberCount: crew.memberCount,
  createdAt: crew.createdAt,
};

const toCrew = <T extends { banner: string }>(r: T): Omit<T, "banner"> & { banner: Banner } => ({
  ...r,
  banner: isBanner(r.banner) ? r.banner : "ninth-wave",
});

/** Banned members drop off crew pages (banned is null for most users). */
const visible = or(eq(user.banned, false), sql`${user.banned} is null`)!;

const ROLE_ORDER = sql`case ${crewMember.role} when 'captain' then 0 when 'officer' then 1 else 2 end`;

// --- Reading --------------------------------------------------------------------

export async function getCrewBySlug(slug: string): Promise<Crew | null> {
  const s = slug.toLowerCase();
  if (!/^[a-z0-9_-]{1,24}$/.test(s)) return null;
  const [row] = await db().select(crewColumns).from(crew).where(eq(crew.slug, s)).limit(1);
  return row ? toCrew(row) : null;
}

export type CrewSort = "new" | "members";

export async function listCrews(
  opts: { sort?: CrewSort; limit?: number; offset?: number } = {},
): Promise<Crew[]> {
  const rows = await db()
    .select(crewColumns)
    .from(crew)
    .orderBy(
      ...(opts.sort === "members"
        ? [desc(crew.memberCount), asc(crew.slug)]
        : [desc(crew.createdAt), asc(crew.slug)]),
    )
    .limit(Math.min(Math.max(opts.limit ?? 48, 1), 100))
    .offset(Math.max(opts.offset ?? 0, 0));
  return rows.map(toCrew);
}

/** Captain first, then officers, then deckhands; longest-serving first within each. */
export async function listCrewMembers(crewId: string): Promise<CrewMember[]> {
  return db()
    .select({
      userId: crewMember.userId,
      handle: creatorProfile.handle,
      displayName: creatorProfile.displayName,
      image: user.image,
      role: crewMember.role,
      joinedAt: crewMember.joinedAt,
    })
    .from(crewMember)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, crewMember.userId))
    .innerJoin(user, eq(user.id, crewMember.userId))
    .where(and(eq(crewMember.crewId, crewId), visible))
    .orderBy(ROLE_ORDER, asc(crewMember.joinedAt), asc(crewMember.userId));
}

export async function listCrewRequests(crewId: string): Promise<CrewRequest[]> {
  return db()
    .select({
      userId: crewRequest.userId,
      handle: creatorProfile.handle,
      displayName: creatorProfile.displayName,
      image: user.image,
      message: crewRequest.message,
      createdAt: crewRequest.createdAt,
    })
    .from(crewRequest)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, crewRequest.userId))
    .innerJoin(user, eq(user.id, crewRequest.userId))
    .where(and(eq(crewRequest.crewId, crewId), visible))
    .orderBy(asc(crewRequest.createdAt));
}

export async function standing(crewId: string, userId: string | null): Promise<Standing> {
  if (!userId) return { kind: "none" };
  const [m] = await db()
    .select({ role: crewMember.role })
    .from(crewMember)
    .where(and(eq(crewMember.crewId, crewId), eq(crewMember.userId, userId)))
    .limit(1);
  if (m) return { kind: "member", role: m.role };
  const [r] = await db()
    .select({ c: crewRequest.crewId })
    .from(crewRequest)
    .where(and(eq(crewRequest.crewId, crewId), eq(crewRequest.userId, userId)))
    .limit(1);
  return r ? { kind: "requested" } : { kind: "none" };
}

/** The member's crews with their role, and the crews they've asked to join. */
export async function listMyCrews(
  userId: string,
): Promise<{ crews: (Crew & { role: CrewRole })[]; requested: Crew[] }> {
  const [crews, requested] = await Promise.all([
    db()
      .select({ ...crewColumns, role: crewMember.role })
      .from(crewMember)
      .innerJoin(crew, eq(crew.id, crewMember.crewId))
      .where(eq(crewMember.userId, userId))
      .orderBy(ROLE_ORDER, asc(crew.name)),
    db()
      .select(crewColumns)
      .from(crewRequest)
      .innerJoin(crew, eq(crew.id, crewRequest.crewId))
      .where(eq(crewRequest.userId, userId))
      .orderBy(desc(crewRequest.createdAt)),
  ]);
  return { crews: crews.map(toCrew), requested: requested.map(toCrew) };
}

/** Open requests across the crews this member captains or officers (for the dashboard badge). */
export async function pendingRequestCount(userId: string): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(crewRequest)
    .innerJoin(
      crewMember,
      and(
        eq(crewMember.crewId, crewRequest.crewId),
        eq(crewMember.userId, userId),
        sql`${crewMember.role} in ('captain', 'officer')`,
      ),
    );
  return row?.n ?? 0;
}

// --- Founding and editing ---------------------------------------------------------

export type CrewInput = {
  slug: string;
  name: string;
  motto?: string;
  banner?: string;
  joinPolicy?: string;
};

export type CrewFieldError =
  | { field: "slug"; error: HandleError | "taken" }
  | { field: "name"; error: "required" | "too_long" }
  | { field: "motto"; error: "too_long" }
  | { field: "banner"; error: "invalid" }
  | { field: "joinPolicy"; error: "invalid" };

export type CrewError =
  | "no_profile"
  | "crew_limit"
  | "not_found"
  | "forbidden"
  | "full"
  | "already_member"
  | "already_requested"
  | "not_member"
  | "captain_must_hand_over"
  | "self";

export type CreateCrewResult =
  | { ok: true; crew: Crew }
  | { ok: false; errors: CrewFieldError[] }
  | { ok: false; error: CrewError };

type Clean = { slug: string; name: string; motto: string; banner: Banner; joinPolicy: JoinPolicy };

function clean(
  input: CrewInput,
): { ok: true; value: Clean } | { ok: false; errors: CrewFieldError[] } {
  const errors: CrewFieldError[] = [];
  const slug = checkHandle(input.slug);
  if (!slug.ok) errors.push({ field: "slug", error: slug.error });
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) errors.push({ field: "name", error: "required" });
  else if (name.length > CREW_NAME_MAX) errors.push({ field: "name", error: "too_long" });
  const motto = (input.motto ?? "").replace(/\s+/g, " ").trim();
  if (motto.length > CREW_MOTTO_MAX) errors.push({ field: "motto", error: "too_long" });
  const banner = input.banner ?? "ninth-wave";
  if (!isBanner(banner)) errors.push({ field: "banner", error: "invalid" });
  const joinPolicy = input.joinPolicy ?? "request";
  if (!(JOIN_POLICIES as readonly string[]).includes(joinPolicy))
    errors.push({ field: "joinPolicy", error: "invalid" });
  if (!slug.ok || errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      slug: slug.handle,
      name,
      motto,
      banner: banner as Banner,
      joinPolicy: joinPolicy as JoinPolicy,
    },
  };
}

const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
};

async function hasProfile(userId: string): Promise<boolean> {
  const [p] = await db()
    .select({ u: creatorProfile.userId })
    .from(creatorProfile)
    .where(eq(creatorProfile.userId, userId))
    .limit(1);
  return !!p;
}

async function crewsJoined(userId: string): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(crewMember)
    .where(eq(crewMember.userId, userId));
  return row?.n ?? 0;
}

/** Founds a crew with the member as its captain. */
export async function createCrew(userId: string, input: CrewInput): Promise<CreateCrewResult> {
  const c = clean(input);
  if (!c.ok) return c;
  if (!(await hasProfile(userId))) return { ok: false, error: "no_profile" };
  if ((await crewsJoined(userId)) >= CREWS_PER_MEMBER_MAX)
    return { ok: false, error: "crew_limit" };
  try {
    const id = await db().transaction(async (tx) => {
      const [row] = await tx.insert(crew).values(c.value).returning({ id: crew.id });
      await tx.insert(crewMember).values({ crewId: row!.id, userId, role: "captain" });
      return row!.id;
    });
    const [row] = await db().select(crewColumns).from(crew).where(eq(crew.id, id));
    return { ok: true, crew: toCrew(row!) };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, errors: [{ field: "slug", error: "taken" }] };
    throw err;
  }
}

export type UpdateCrewResult =
  | { ok: true; crew: Crew; previousSlug: string | null }
  | { ok: false; errors: CrewFieldError[] }
  | { ok: false; error: CrewError };

/** Captain only: name, link, motto, banner and how people join. */
export async function updateCrew(
  actorId: string,
  crewId: string,
  input: CrewInput,
): Promise<UpdateCrewResult> {
  const c = clean(input);
  if (!c.ok) return c;
  const s = await standing(crewId, actorId);
  if (s.kind !== "member" || s.role !== "captain") return { ok: false, error: "forbidden" };
  const [before] = await db().select({ slug: crew.slug }).from(crew).where(eq(crew.id, crewId));
  if (!before) return { ok: false, error: "not_found" };
  try {
    await db().transaction(async (tx) => {
      await tx.update(crew).set(c.value).where(eq(crew.id, crewId));
      // Opening the doors lets everyone who was waiting in, as far as there's room.
      if (c.value.joinPolicy === "open") await admitWaiting(tx, crewId);
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, errors: [{ field: "slug", error: "taken" }] };
    throw err;
  }
  const [row] = await db().select(crewColumns).from(crew).where(eq(crew.id, crewId));
  return {
    ok: true,
    crew: toCrew(row!),
    previousSlug: before.slug !== c.value.slug ? before.slug : null,
  };
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/** Locks the crew row so size checks and joins can't race. */
async function lockCrew(tx: Tx, crewId: string) {
  const [row] = await tx
    .select({ memberCount: crew.memberCount, joinPolicy: crew.joinPolicy })
    .from(crew)
    .where(eq(crew.id, crewId))
    .for("update");
  return row ?? null;
}

async function admitWaiting(tx: Tx, crewId: string) {
  const locked = await lockCrew(tx, crewId);
  if (!locked) return;
  let room = CREW_SIZE_MAX - locked.memberCount;
  const waiting = await tx
    .select({ userId: crewRequest.userId })
    .from(crewRequest)
    .where(eq(crewRequest.crewId, crewId))
    .orderBy(asc(crewRequest.createdAt));
  for (const w of waiting) {
    if (room <= 0) break;
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(crewMember)
      .where(eq(crewMember.userId, w.userId))) as [{ n: number }];
    if (n >= CREWS_PER_MEMBER_MAX) continue;
    await tx.insert(crewMember).values({ crewId, userId: w.userId }).onConflictDoNothing();
    await tx
      .delete(crewRequest)
      .where(and(eq(crewRequest.crewId, crewId), eq(crewRequest.userId, w.userId)));
    room--;
  }
}

// --- Joining and leaving -----------------------------------------------------------

export type JoinResult =
  { ok: true; status: "joined" | "requested" } | { ok: false; error: CrewError };

/** Joins an open crew straight away, or leaves a request with an optional note for the officers. */
export async function joinCrew(userId: string, crewId: string, message = ""): Promise<JoinResult> {
  if (!(await hasProfile(userId))) return { ok: false, error: "no_profile" };
  const note = message.replace(/\s+/g, " ").trim().slice(0, REQUEST_MESSAGE_MAX);
  return db().transaction(async (tx) => {
    const locked = await lockCrew(tx, crewId);
    if (!locked) return { ok: false, error: "not_found" } as const;
    const [member] = await tx
      .select({ r: crewMember.role })
      .from(crewMember)
      .where(and(eq(crewMember.crewId, crewId), eq(crewMember.userId, userId)));
    if (member) return { ok: false, error: "already_member" } as const;
    if (locked.memberCount >= CREW_SIZE_MAX) return { ok: false, error: "full" } as const;
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(crewMember)
      .where(eq(crewMember.userId, userId))) as [{ n: number }];
    if (n >= CREWS_PER_MEMBER_MAX) return { ok: false, error: "crew_limit" } as const;

    if (locked.joinPolicy === "open") {
      await tx.insert(crewMember).values({ crewId, userId });
      await tx
        .delete(crewRequest)
        .where(and(eq(crewRequest.crewId, crewId), eq(crewRequest.userId, userId)));
      return { ok: true, status: "joined" } as const;
    }
    const inserted = await tx
      .insert(crewRequest)
      .values({ crewId, userId, message: note })
      .onConflictDoNothing()
      .returning({ c: crewRequest.crewId });
    if (!inserted.length) return { ok: false, error: "already_requested" } as const;
    return { ok: true, status: "requested" } as const;
  });
}

export async function cancelRequest(userId: string, crewId: string): Promise<void> {
  await db()
    .delete(crewRequest)
    .where(and(eq(crewRequest.crewId, crewId), eq(crewRequest.userId, userId)));
}

export type ActionResult = { ok: true } | { ok: false; error: CrewError };

/** Officers and the captain let a request in or turn it down. */
export async function answerRequest(
  actorId: string,
  crewId: string,
  userId: string,
  accept: boolean,
): Promise<ActionResult> {
  const s = await standing(crewId, actorId);
  if (s.kind !== "member" || s.role === "deckhand") return { ok: false, error: "forbidden" };
  return db().transaction(async (tx) => {
    const locked = await lockCrew(tx, crewId);
    if (!locked) return { ok: false, error: "not_found" } as const;
    const removed = await tx
      .delete(crewRequest)
      .where(and(eq(crewRequest.crewId, crewId), eq(crewRequest.userId, userId)))
      .returning({ c: crewRequest.crewId });
    if (!removed.length) return { ok: false, error: "not_found" } as const;
    if (!accept) return { ok: true } as const;
    if (locked.memberCount >= CREW_SIZE_MAX) {
      // Keep the request so it can be answered once there's room.
      await tx.insert(crewRequest).values({ crewId, userId }).onConflictDoNothing();
      return { ok: false, error: "full" } as const;
    }
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(crewMember)
      .where(eq(crewMember.userId, userId))) as [{ n: number }];
    if (n >= CREWS_PER_MEMBER_MAX) return { ok: false, error: "crew_limit" } as const;
    await tx.insert(crewMember).values({ crewId, userId }).onConflictDoNothing();
    return { ok: true } as const;
  });
}

/**
 * Leaves a crew. A captain hands the helm over first; a captain sailing alone disbands the crew by
 * leaving (the trigger removes a crew with nobody left).
 */
export async function leaveCrew(userId: string, crewId: string): Promise<ActionResult> {
  const s = await standing(crewId, userId);
  if (s.kind !== "member") return { ok: false, error: "not_member" };
  if (s.role === "captain") {
    const [row] = await db().select({ n: crew.memberCount }).from(crew).where(eq(crew.id, crewId));
    if ((row?.n ?? 0) > 1) return { ok: false, error: "captain_must_hand_over" };
  }
  await db()
    .delete(crewMember)
    .where(and(eq(crewMember.crewId, crewId), eq(crewMember.userId, userId)));
  return { ok: true };
}

// --- Roles ---------------------------------------------------------------------------

/** Captain only: makes a member an officer or a deckhand. */
export async function setCrewRole(
  actorId: string,
  crewId: string,
  userId: string,
  role: "officer" | "deckhand",
): Promise<ActionResult> {
  if (actorId === userId) return { ok: false, error: "self" };
  const s = await standing(crewId, actorId);
  if (s.kind !== "member" || s.role !== "captain") return { ok: false, error: "forbidden" };
  const updated = await db()
    .update(crewMember)
    .set({ role })
    .where(
      and(
        eq(crewMember.crewId, crewId),
        eq(crewMember.userId, userId),
        sql`${crewMember.role} <> 'captain'`,
      ),
    )
    .returning({ u: crewMember.userId });
  return updated.length ? { ok: true } : { ok: false, error: "not_member" };
}

/** Captain only: hands the helm to another member and stays on as an officer. */
export async function transferCaptain(
  actorId: string,
  crewId: string,
  userId: string,
): Promise<ActionResult> {
  if (actorId === userId) return { ok: false, error: "self" };
  return db().transaction(async (tx) => {
    if (!(await lockCrew(tx, crewId))) return { ok: false, error: "not_found" } as const;
    const rows = await tx
      .select({ userId: crewMember.userId, role: crewMember.role })
      .from(crewMember)
      .where(
        and(
          eq(crewMember.crewId, crewId),
          or(eq(crewMember.userId, actorId), eq(crewMember.userId, userId)),
        ),
      );
    const me = rows.find((r) => r.userId === actorId);
    const heir = rows.find((r) => r.userId === userId);
    if (me?.role !== "captain") return { ok: false, error: "forbidden" } as const;
    if (!heir) return { ok: false, error: "not_member" } as const;
    // Demote first: the one-captain index would refuse two captains at once.
    await tx
      .update(crewMember)
      .set({ role: "officer" })
      .where(and(eq(crewMember.crewId, crewId), eq(crewMember.userId, actorId)));
    await tx
      .update(crewMember)
      .set({ role: "captain" })
      .where(and(eq(crewMember.crewId, crewId), eq(crewMember.userId, userId)));
    return { ok: true } as const;
  });
}

/** The captain removes anyone; officers remove deckhands. */
export async function removeMember(
  actorId: string,
  crewId: string,
  userId: string,
): Promise<ActionResult> {
  if (actorId === userId) return { ok: false, error: "self" };
  const [actor, target] = await Promise.all([standing(crewId, actorId), standing(crewId, userId)]);
  if (target.kind !== "member") return { ok: false, error: "not_member" };
  const allowed =
    actor.kind === "member" &&
    (actor.role === "captain" || (actor.role === "officer" && target.role === "deckhand"));
  if (!allowed) return { ok: false, error: "forbidden" };
  await db()
    .delete(crewMember)
    .where(and(eq(crewMember.crewId, crewId), eq(crewMember.userId, userId)));
  return { ok: true };
}

/** The captain, or site staff (logged in the audit log), disbands a crew. */
export async function disbandCrew(actor: Actor, crewId: string): Promise<ActionResult> {
  const s = await standing(crewId, actor.id);
  const captain = s.kind === "member" && s.role === "captain";
  const staff = !captain && isStaff(actor);
  if (!captain && !staff) return { ok: false, error: "forbidden" };
  return db().transaction(async (tx) => {
    const [gone] = await tx
      .delete(crew)
      .where(eq(crew.id, crewId))
      .returning({ slug: crew.slug, name: crew.name });
    if (!gone) return { ok: false, error: "not_found" } as const;
    if (staff)
      await audit(
        actor.id,
        { action: "crew.disband", targetType: "crew", targetId: crewId, meta: gone },
        tx,
      );
    return { ok: true } as const;
  });
}
