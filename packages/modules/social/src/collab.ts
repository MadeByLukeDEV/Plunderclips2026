import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { notify } from "@plunderclips/notifications";
import { standing, type CrewRole } from "./crews";

const { crew, crewMember, crewBoardItem, crewSession, crewSessionRsvp, creatorProfile } = schema;

export const BOARD_TITLE_MAX = 120;
export const BOARD_NOTES_MAX = 1000;
export const SESSION_TITLE_MAX = 100;
export const SESSION_NOTES_MAX = 1000;
export const BOARD_STATUSES = ["idea", "planned", "done"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];
export type RsvpStatus = "going" | "maybe";

export type CollabError = "forbidden" | "not_found" | "invalid" | "too_many";

const clean = (v: string | undefined, max: number) =>
  (v ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** The viewer's role in the crew, or null for outsiders. */
async function roleIn(crewId: string, userId: string): Promise<CrewRole | null> {
  const s = await standing(crewId, userId);
  return s.kind === "member" ? s.role : null;
}
const leads = (r: CrewRole | null) => r === "captain" || r === "officer";

// --- Board ------------------------------------------------------------------------------

export type BoardItem = {
  id: string;
  title: string;
  notes: string;
  status: BoardStatus;
  authorId: string | null;
  authorName: string | null;
  updatedAt: Date;
};

/** The crew's board for a member; null for anyone outside the crew. */
export async function listBoard(crewId: string, viewerId: string): Promise<BoardItem[] | null> {
  if (!(await roleIn(crewId, viewerId))) return null;
  return db()
    .select({
      id: crewBoardItem.id,
      title: crewBoardItem.title,
      notes: crewBoardItem.notes,
      status: crewBoardItem.status,
      authorId: crewBoardItem.authorId,
      authorName: creatorProfile.displayName,
      updatedAt: crewBoardItem.updatedAt,
    })
    .from(crewBoardItem)
    .leftJoin(creatorProfile, eq(creatorProfile.userId, crewBoardItem.authorId))
    .where(eq(crewBoardItem.crewId, crewId))
    .orderBy(desc(crewBoardItem.updatedAt))
    .limit(300);
}

export type BoardResult = { ok: true; id: string } | { ok: false; error: CollabError };

/** Any member adds an idea (or a plan). 300 items per crew at most. */
export async function addBoardItem(
  userId: string,
  crewId: string,
  input: { title: string; notes?: string; status?: string },
): Promise<BoardResult> {
  if (!(await roleIn(crewId, userId))) return { ok: false, error: "forbidden" };
  const title = clean(input.title, BOARD_TITLE_MAX).replace(/\s+/g, " ");
  if (!title) return { ok: false, error: "invalid" };
  const status = (BOARD_STATUSES as readonly string[]).includes(input.status ?? "")
    ? (input.status as BoardStatus)
    : "idea";
  const [{ n }] = (await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(crewBoardItem)
    .where(eq(crewBoardItem.crewId, crewId))) as [{ n: number }];
  if (n >= 300) return { ok: false, error: "too_many" };
  const [row] = await db()
    .insert(crewBoardItem)
    .values({ crewId, authorId: userId, title, notes: clean(input.notes, BOARD_NOTES_MAX), status })
    .returning({ id: crewBoardItem.id });
  return { ok: true, id: row!.id };
}

/** Authors change their own items; the captain and officers change any. */
async function editableItem(userId: string, itemId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const [item] = await db()
    .select({ crewId: crewBoardItem.crewId, authorId: crewBoardItem.authorId })
    .from(crewBoardItem)
    .where(eq(crewBoardItem.id, itemId));
  if (!item) return null;
  const role = await roleIn(item.crewId, userId);
  if (!role) return null;
  return item.authorId === userId || leads(role) ? item : null;
}

export async function updateBoardItem(
  userId: string,
  itemId: string,
  input: { title?: string; notes?: string; status?: string },
): Promise<BoardResult> {
  if (!(await editableItem(userId, itemId))) return { ok: false, error: "forbidden" };
  const set: Partial<{ title: string; notes: string; status: BoardStatus }> = {};
  if (input.title !== undefined) {
    const t = clean(input.title, BOARD_TITLE_MAX).replace(/\s+/g, " ");
    if (!t) return { ok: false, error: "invalid" };
    set.title = t;
  }
  if (input.notes !== undefined) set.notes = clean(input.notes, BOARD_NOTES_MAX);
  if (input.status !== undefined) {
    if (!(BOARD_STATUSES as readonly string[]).includes(input.status))
      return { ok: false, error: "invalid" };
    set.status = input.status as BoardStatus;
  }
  await db().update(crewBoardItem).set(set).where(eq(crewBoardItem.id, itemId));
  return { ok: true, id: itemId };
}

export async function deleteBoardItem(userId: string, itemId: string): Promise<BoardResult> {
  if (!(await editableItem(userId, itemId))) return { ok: false, error: "forbidden" };
  await db().delete(crewBoardItem).where(eq(crewBoardItem.id, itemId));
  return { ok: true, id: itemId };
}

// --- Sessions ---------------------------------------------------------------------------

export type CrewSession = {
  id: string;
  title: string;
  notes: string;
  startsAt: Date;
  durationMin: number;
  isPublic: boolean;
  going: { userId: string; name: string; handle: string }[];
  maybe: { userId: string; name: string; handle: string }[];
};

async function withRsvps(
  rows: Omit<CrewSession, "going" | "maybe">[],
): Promise<CrewSession[]> {
  if (!rows.length) return [];
  const rsvps = await db()
    .select({
      sessionId: crewSessionRsvp.sessionId,
      status: crewSessionRsvp.status,
      userId: crewSessionRsvp.userId,
      name: creatorProfile.displayName,
      handle: creatorProfile.handle,
    })
    .from(crewSessionRsvp)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, crewSessionRsvp.userId))
    .where(
      inArray(
        crewSessionRsvp.sessionId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((r) => ({
    ...r,
    going: rsvps.filter((x) => x.sessionId === r.id && x.status === "going"),
    maybe: rsvps.filter((x) => x.sessionId === r.id && x.status === "maybe"),
  }));
}

const sessionColumns = {
  id: crewSession.id,
  title: crewSession.title,
  notes: crewSession.notes,
  startsAt: crewSession.startsAt,
  durationMin: crewSession.durationMin,
  isPublic: crewSession.isPublic,
};

/**
 * Sessions between `from` and `to`. Members see all of them; everyone else only public ones
 * (viewerId null or outside the crew).
 */
export async function listSessions(
  crewId: string,
  viewerId: string | null,
  range: { from: Date; to: Date },
): Promise<CrewSession[]> {
  const member = viewerId ? !!(await roleIn(crewId, viewerId)) : false;
  const where = [
    eq(crewSession.crewId, crewId),
    gte(crewSession.startsAt, range.from),
    lt(crewSession.startsAt, range.to),
  ];
  if (!member) where.push(eq(crewSession.isPublic, true));
  const rows = await db()
    .select(sessionColumns)
    .from(crewSession)
    .where(and(...where))
    .orderBy(asc(crewSession.startsAt))
    .limit(200);
  return withRsvps(rows);
}

export type SessionInput = {
  title: string;
  notes?: string;
  startsAt: string | Date;
  durationMin?: number;
  isPublic?: boolean;
};

function cleanSession(input: SessionInput) {
  const title = clean(input.title, SESSION_TITLE_MAX).replace(/\s+/g, " ");
  const startsAt = new Date(input.startsAt);
  const durationMin = Math.round(Number(input.durationMin ?? 120));
  const now = Date.now();
  if (!title || Number.isNaN(startsAt.getTime())) return null;
  // A day back (fixing a typo just after it started) to a year ahead.
  if (startsAt.getTime() < now - 86_400_000 || startsAt.getTime() > now + 366 * 86_400_000)
    return null;
  if (!(durationMin >= 15 && durationMin <= 24 * 60)) return null;
  return {
    title,
    notes: clean(input.notes, SESSION_NOTES_MAX),
    startsAt,
    durationMin,
    isPublic: input.isPublic === true,
  };
}

/** The captain or an officer schedules a session; the rest of the crew hears about it. */
export async function createSession(
  userId: string,
  crewId: string,
  input: SessionInput,
): Promise<BoardResult> {
  if (!leads(await roleIn(crewId, userId))) return { ok: false, error: "forbidden" };
  const value = cleanSession(input);
  if (!value) return { ok: false, error: "invalid" };
  const [{ n }] = (await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(crewSession)
    .where(and(eq(crewSession.crewId, crewId), gte(crewSession.startsAt, new Date())))) as [
    { n: number },
  ];
  if (n >= 100) return { ok: false, error: "too_many" };
  const [row] = await db()
    .insert(crewSession)
    .values({ crewId, createdBy: userId, ...value })
    .returning({ id: crewSession.id });

  const [info] = await db()
    .select({ slug: crew.slug, name: crew.name })
    .from(crew)
    .where(eq(crew.id, crewId));
  const members = await db()
    .select({ userId: crewMember.userId })
    .from(crewMember)
    .where(eq(crewMember.crewId, crewId));
  if (info)
    await notify(
      members.map((m) => ({
        userId: m.userId,
        kind: "session_scheduled" as const,
        actorId: userId,
        data: {
          slug: info.slug,
          crew: info.name,
          sessionId: row!.id,
          title: value.title,
          startsAt: value.startsAt.toISOString(),
        },
      })),
    );
  return { ok: true, id: row!.id };
}

async function sessionCrew(sessionId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const [s] = await db()
    .select({ crewId: crewSession.crewId })
    .from(crewSession)
    .where(eq(crewSession.id, sessionId));
  return s?.crewId ?? null;
}

export async function updateSession(
  userId: string,
  sessionId: string,
  input: SessionInput,
): Promise<BoardResult> {
  const crewId = await sessionCrew(sessionId);
  if (!crewId) return { ok: false, error: "not_found" };
  if (!leads(await roleIn(crewId, userId))) return { ok: false, error: "forbidden" };
  const value = cleanSession(input);
  if (!value) return { ok: false, error: "invalid" };
  await db().update(crewSession).set(value).where(eq(crewSession.id, sessionId));
  return { ok: true, id: sessionId };
}

export async function deleteSession(userId: string, sessionId: string): Promise<BoardResult> {
  const crewId = await sessionCrew(sessionId);
  if (!crewId) return { ok: false, error: "not_found" };
  if (!leads(await roleIn(crewId, userId))) return { ok: false, error: "forbidden" };
  await db().delete(crewSession).where(eq(crewSession.id, sessionId));
  return { ok: true, id: sessionId };
}

/** A member says they're going, maybe going, or (null) takes it back. */
export async function rsvp(
  userId: string,
  sessionId: string,
  status: RsvpStatus | null,
): Promise<BoardResult> {
  const crewId = await sessionCrew(sessionId);
  if (!crewId) return { ok: false, error: "not_found" };
  if (!(await roleIn(crewId, userId))) return { ok: false, error: "forbidden" };
  if (status === null)
    await db()
      .delete(crewSessionRsvp)
      .where(and(eq(crewSessionRsvp.sessionId, sessionId), eq(crewSessionRsvp.userId, userId)));
  else
    await db()
      .insert(crewSessionRsvp)
      .values({ sessionId, userId, status })
      .onConflictDoUpdate({
        target: [crewSessionRsvp.sessionId, crewSessionRsvp.userId],
        set: { status },
      });
  return { ok: true, id: sessionId };
}

/** Upcoming public sessions (and ones that started in the last 3 hours), for the crew page. */
export async function nextPublicSessions(crewId: string, limit = 3): Promise<CrewSession[]> {
  const now = new Date();
  const rows = await db()
    .select(sessionColumns)
    .from(crewSession)
    .where(
      and(
        eq(crewSession.crewId, crewId),
        eq(crewSession.isPublic, true),
        gte(crewSession.startsAt, new Date(now.getTime() - 3 * 3_600_000)),
      ),
    )
    .orderBy(asc(crewSession.startsAt))
    .limit(limit);
  return withRsvps(rows);
}
