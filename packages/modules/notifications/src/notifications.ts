import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { logger, redis } from "@plunderclips/shared";

const { notification, user, creatorProfile } = schema;

export type NotificationKind =
  "clip_approved" | "clip_rejected" | "new_follower" | "crew_request" | "crew_accepted" | "mention";

/**
 * What each kind carries. Snapshot values (titles, names) so a notification reads on its own even
 * after the clip is renamed or the crew is gone.
 */
export type NotificationData = {
  clip_approved: { clipId: string; title: string };
  clip_rejected: { clipId: string; title: string; reason: string };
  new_follower: { handle: string; name: string };
  crew_request: { slug: string; crew: string; name: string };
  crew_accepted: { slug: string; crew: string };
  mention: { channelId: string; messageId: string; where: string; name: string; excerpt: string };
};

export type NewNotification<K extends NotificationKind = NotificationKind> = {
  userId: string;
  kind: K;
  actorId?: string | null;
  data: NotificationData[K];
  /** Same key while unread collapses into one row. */
  dedupeKey?: string;
};

export type Notification = {
  [K in NotificationKind]: {
    id: number;
    kind: K;
    data: NotificationData[K];
    actor: { name: string; image: string | null; handle: string | null } | null;
    read: boolean;
    createdAt: Date;
  };
}[NotificationKind];

type Executor = Pick<ReturnType<typeof db>, "insert">;

const topic = (userId: string) => `notify:${userId}`;

/**
 * Saves notifications (inside the caller's transaction when given one). Never notifies someone
 * about their own action. Returns who got one, for announce() once the transaction commits.
 */
export async function insertNotifications(
  rows: NewNotification[],
  tx?: Executor,
): Promise<string[]> {
  const keep = rows.filter((r) => r.userId && r.userId !== r.actorId);
  if (!keep.length) return [];
  const inserted = await (tx ?? db())
    .insert(notification)
    .values(
      keep.map((r) => ({
        userId: r.userId,
        kind: r.kind,
        actorId: r.actorId ?? null,
        data: r.data as Record<string, string>,
        dedupeKey: r.dedupeKey ?? null,
      })),
    )
    .onConflictDoNothing()
    .returning({ userId: notification.userId });
  return [...new Set(inserted.map((r) => r.userId))];
}

/** Tells open tabs their count changed. Call after the transaction that inserted the rows. */
export async function announce(userIds: string[]): Promise<void> {
  await Promise.all(
    [...new Set(userIds)].map((id) =>
      redis()
        .publish(topic(id), "changed")
        .catch((err: unknown) => logger.warn("notify publish failed", { error: String(err) })),
    ),
  );
}

/** Insert and announce in one go, for callers outside a transaction. Never throws. */
export async function notify(rows: NewNotification[]): Promise<void> {
  try {
    await announce(await insertNotifications(rows));
  } catch (err) {
    // A notification is never worth failing the action that caused it.
    logger.warn("notify failed", { error: String(err) });
  }
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return row?.n ?? 0;
}

/** Newest first; `before` pages back. */
export async function listNotifications(
  userId: string,
  opts: { before?: number; limit?: number } = {},
): Promise<{ items: Notification[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const where = [eq(notification.userId, userId)];
  if (opts.before) where.push(lt(notification.id, opts.before));
  const rows = await db()
    .select({
      id: notification.id,
      kind: notification.kind,
      data: notification.data,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      actorName: user.name,
      actorImage: user.image,
      actorDisplay: creatorProfile.displayName,
      actorHandle: creatorProfile.handle,
    })
    .from(notification)
    .leftJoin(user, eq(user.id, notification.actorId))
    .leftJoin(creatorProfile, eq(creatorProfile.userId, notification.actorId))
    .where(and(...where))
    .orderBy(desc(notification.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map(
    (r) =>
      ({
        id: r.id,
        kind: r.kind,
        data: r.data,
        actor: r.actorName
          ? { name: r.actorDisplay ?? r.actorName, image: r.actorImage, handle: r.actorHandle }
          : null,
        read: !!r.readAt,
        createdAt: r.createdAt,
      }) as Notification,
  );
  return { items, hasMore: rows.length > limit };
}

/** Marks some (by id) or all of the member's notifications read. */
export async function markRead(userId: string, ids?: number[]): Promise<void> {
  const where = [eq(notification.userId, userId), isNull(notification.readAt)];
  if (ids) {
    const valid = ids.filter((i) => Number.isSafeInteger(i) && i > 0).slice(0, 100);
    if (!valid.length) return;
    where.push(inArray(notification.id, valid));
  }
  const done = await db()
    .update(notification)
    .set({ readAt: new Date() })
    .where(and(...where))
    .returning({ id: notification.id });
  if (done.length) await announce([userId]);
}

// --- Live -----------------------------------------------------------------------------

type Listener = () => void;
type Bus = { sub: ReturnType<typeof redis>; listeners: Map<string, Set<Listener>> };
const g = globalThis as unknown as { __notifyBus?: Bus };

function bus(): Bus {
  if (!g.__notifyBus) {
    const sub = redis().duplicate();
    const listeners = new Map<string, Set<Listener>>();
    sub.on("message", (ch: string) => {
      for (const l of listeners.get(ch.slice("notify:".length)) ?? []) l();
    });
    sub.on("error", (err: Error) => logger.warn("notify bus error", { error: err.message }));
    g.__notifyBus = { sub, listeners };
  }
  return g.__notifyBus;
}

/** Calls `listener` whenever the member's notifications change; returns the unsubscribe. */
export async function subscribeNotifications(
  userId: string,
  listener: Listener,
): Promise<() => Promise<void>> {
  const b = bus();
  let set = b.listeners.get(userId);
  if (!set) {
    set = new Set();
    b.listeners.set(userId, set);
    await b.sub.subscribe(topic(userId));
  }
  set.add(listener);
  return async () => {
    set.delete(listener);
    if (!set.size && b.listeners.get(userId) === set) {
      b.listeners.delete(userId);
      await b.sub.unsubscribe(topic(userId)).catch(() => {});
    }
  };
}
