import { and, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { audit, isStaff, type Actor } from "@plunderclips/moderation";
import { mediaUrl } from "@plunderclips/media";
import { notify } from "@plunderclips/notifications";
import { slidingWindow } from "@plunderclips/shared";
import { publish, type ChatMessageWire } from "./chat-bus";

const {
  chatChannel,
  chatParticipant,
  chatMessage,
  chatRead,
  crew,
  crewMember,
  creatorProfile,
  creatorFollow,
  user,
} = schema;

export const MESSAGE_MAX = 2000;
const PAGE = 50;
/** 20 messages per 30 seconds per member, across every channel. */
export const SEND_LIMIT = { limit: 20, windowSeconds: 30 } as const;

export type ChannelInfo =
  | { id: string; kind: "crew"; crewId: string; title: string; slug: string }
  | {
      id: string;
      kind: "dm";
      title: string;
      handle: string;
      image: string | null;
      otherId: string;
    };

export type ChatMessage = Omit<ChatMessageWire, "createdAt"> & { createdAt: Date };

export type ChatError =
  | "no_profile"
  | "not_found"
  | "self"
  | "not_allowed"
  | "forbidden"
  | "empty"
  | "too_long"
  | "rate_limited"
  | "banned";

const dmKey = (a: string, b: string) => [a, b].sort().join("|");

const messageColumns = {
  id: chatMessage.id,
  channelId: chatMessage.channelId,
  authorId: chatMessage.authorId,
  handle: creatorProfile.handle,
  displayName: creatorProfile.displayName,
  image: user.image,
  body: chatMessage.body,
  createdAt: chatMessage.createdAt,
  deletedBy: chatMessage.deletedBy,
};

type Row = {
  id: number;
  channelId: string;
  authorId: string;
  handle: string;
  displayName: string;
  image: string | null;
  body: string;
  createdAt: Date;
  deletedBy: string | null;
};

const toMessage = (r: Row): ChatMessage => ({
  id: r.id,
  channelId: r.channelId,
  authorId: r.authorId,
  handle: r.handle,
  displayName: r.displayName,
  image: r.image,
  body: r.deletedBy ? "" : r.body,
  createdAt: r.createdAt,
  deleted: r.deletedBy === "staff" ? "staff" : r.deletedBy ? "author" : null,
});

export const toWire = (m: ChatMessage): ChatMessageWire => ({
  ...m,
  createdAt: m.createdAt.toISOString(),
});

// --- Channels and access --------------------------------------------------------------

/** The crew's channel, made the first time anyone opens it. */
export async function crewChannelId(crewId: string): Promise<string> {
  await db().insert(chatChannel).values({ kind: "crew", crewId }).onConflictDoNothing();
  const [row] = await db()
    .select({ id: chatChannel.id })
    .from(chatChannel)
    .where(eq(chatChannel.crewId, crewId));
  return row!.id;
}

/**
 * The channel, if this member may read and write in it: crew channels follow crew membership,
 * direct messages their two participants. null for everyone else (and for channels that are gone).
 */
export async function channelFor(channelId: string, userId: string): Promise<ChannelInfo | null> {
  if (!/^[0-9a-f-]{36}$/i.test(channelId)) return null;
  const [ch] = await db()
    .select({ id: chatChannel.id, kind: chatChannel.kind, crewId: chatChannel.crewId })
    .from(chatChannel)
    .where(eq(chatChannel.id, channelId));
  if (!ch) return null;

  if (ch.kind === "crew" && ch.crewId) {
    const [row] = await db()
      .select({ name: crew.name, slug: crew.slug })
      .from(crewMember)
      .innerJoin(crew, eq(crew.id, crewMember.crewId))
      .where(and(eq(crewMember.crewId, ch.crewId), eq(crewMember.userId, userId)));
    return row
      ? { id: ch.id, kind: "crew", crewId: ch.crewId, title: row.name, slug: row.slug }
      : null;
  }

  const people = await db()
    .select({
      userId: chatParticipant.userId,
      handle: creatorProfile.handle,
      displayName: creatorProfile.displayName,
      image: user.image,
    })
    .from(chatParticipant)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, chatParticipant.userId))
    .innerJoin(user, eq(user.id, chatParticipant.userId))
    .where(eq(chatParticipant.channelId, ch.id));
  if (!people.some((p) => p.userId === userId)) return null;
  const other = people.find((p) => p.userId !== userId);
  if (!other) return null;
  return {
    id: ch.id,
    kind: "dm",
    title: other.displayName,
    handle: other.handle,
    image: other.image,
    otherId: other.userId,
  };
}

/**
 * Who you may start a conversation with: a creator you share a crew with, or one who follows you
 * (following is the opt-in). A conversation that already exists stays open either way.
 */
async function mayStartDm(from: string, to: string): Promise<boolean> {
  const [follows] = await db()
    .select({ c: creatorFollow.creatorId })
    .from(creatorFollow)
    .where(and(eq(creatorFollow.followerId, to), eq(creatorFollow.creatorId, from)))
    .limit(1);
  if (follows) return true;
  const mine = db()
    .select({ crewId: crewMember.crewId })
    .from(crewMember)
    .where(eq(crewMember.userId, from));
  const [shared] = await db()
    .select({ c: crewMember.crewId })
    .from(crewMember)
    .where(and(eq(crewMember.userId, to), inArray(crewMember.crewId, mine)))
    .limit(1);
  return !!shared;
}

export type OpenDmResult = { ok: true; channelId: string } | { ok: false; error: ChatError };

/** Opens (or reopens) the direct-message channel between the member and a creator. */
export async function openDm(userId: string, otherUserId: string): Promise<OpenDmResult> {
  if (userId === otherUserId) return { ok: false, error: "self" };
  const profiles = await db()
    .select({ userId: creatorProfile.userId })
    .from(creatorProfile)
    .where(inArray(creatorProfile.userId, [userId, otherUserId]));
  if (!profiles.some((p) => p.userId === userId)) return { ok: false, error: "no_profile" };
  if (!profiles.some((p) => p.userId === otherUserId)) return { ok: false, error: "not_found" };

  const key = dmKey(userId, otherUserId);
  const [existing] = await db()
    .select({ id: chatChannel.id })
    .from(chatChannel)
    .where(eq(chatChannel.dmKey, key));
  if (existing) return { ok: true, channelId: existing.id };
  if (!(await mayStartDm(userId, otherUserId))) return { ok: false, error: "not_allowed" };

  const id = await db().transaction(async (tx) => {
    const [made] = await tx
      .insert(chatChannel)
      .values({ kind: "dm", dmKey: key })
      .onConflictDoNothing()
      .returning({ id: chatChannel.id });
    if (!made) {
      const [row] = await tx
        .select({ id: chatChannel.id })
        .from(chatChannel)
        .where(eq(chatChannel.dmKey, key));
      return row!.id;
    }
    await tx.insert(chatParticipant).values([
      { channelId: made.id, userId },
      { channelId: made.id, userId: otherUserId },
    ]);
    return made.id;
  });
  return { ok: true, channelId: id };
}

/** Whether the member could start a conversation with this creator (for the "Message" button). */
export async function canMessage(userId: string, otherUserId: string): Promise<boolean> {
  if (userId === otherUserId) return false;
  const [existing] = await db()
    .select({ id: chatChannel.id })
    .from(chatChannel)
    .where(eq(chatChannel.dmKey, dmKey(userId, otherUserId)));
  return !!existing || mayStartDm(userId, otherUserId);
}

// --- Inbox ----------------------------------------------------------------------------

export type InboxItem = {
  channelId: string;
  kind: "crew" | "dm";
  title: string;
  /** Crew slug or creator handle. */
  ref: string;
  image: string | null;
  lastMessageAt: Date | null;
  unread: number;
};

/** Every crew channel and conversation the member is in, the most recent first. */
export async function listInbox(userId: string): Promise<InboxItem[]> {
  const crews = await db()
    .select({ crewId: crew.id, name: crew.name, slug: crew.slug, logo: crew.logoImage })
    .from(crewMember)
    .innerJoin(crew, eq(crew.id, crewMember.crewId))
    .where(eq(crewMember.userId, userId));
  const crewChannels = await Promise.all(
    crews.map(async (c) => ({ ...c, channelId: await crewChannelId(c.crewId) })),
  );

  const dmChannels = db()
    .select({ id: chatParticipant.channelId })
    .from(chatParticipant)
    .where(eq(chatParticipant.userId, userId));
  const dms = await db()
    .select({
      channelId: chatParticipant.channelId,
      handle: creatorProfile.handle,
      displayName: creatorProfile.displayName,
      image: user.image,
    })
    .from(chatParticipant)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, chatParticipant.userId))
    .innerJoin(user, eq(user.id, chatParticipant.userId))
    .where(and(inArray(chatParticipant.channelId, dmChannels), ne(chatParticipant.userId, userId)));

  const ids = [...crewChannels.map((c) => c.channelId), ...dms.map((d) => d.channelId)];
  if (!ids.length) return [];
  const [meta, unread] = await Promise.all([
    db()
      .select({ id: chatChannel.id, lastMessageAt: chatChannel.lastMessageAt })
      .from(chatChannel)
      .where(inArray(chatChannel.id, ids)),
    unreadByChannel(userId, ids),
  ]);
  const last = new Map(meta.map((m) => [m.id, m.lastMessageAt]));

  const items: InboxItem[] = [
    ...crewChannels.map((c) => ({
      channelId: c.channelId,
      kind: "crew" as const,
      title: c.name,
      ref: c.slug,
      image: mediaUrl(c.logo),
      lastMessageAt: last.get(c.channelId) ?? null,
      unread: unread.get(c.channelId) ?? 0,
    })),
    ...dms
      .filter((d) => last.get(d.channelId))
      .map((d) => ({
        channelId: d.channelId,
        kind: "dm" as const,
        title: d.displayName,
        ref: d.handle,
        image: d.image,
        lastMessageAt: last.get(d.channelId) ?? null,
        unread: unread.get(d.channelId) ?? 0,
      })),
  ];
  return items.sort(
    (a, b) =>
      (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0) ||
      a.title.localeCompare(b.title),
  );
}

/** Messages from others after the member's read marker, per channel. */
async function unreadByChannel(userId: string, channelIds: string[]): Promise<Map<string, number>> {
  if (!channelIds.length) return new Map();
  const rows = await db()
    .select({ channelId: chatMessage.channelId, n: sql<number>`count(*)::int` })
    .from(chatMessage)
    .leftJoin(
      chatRead,
      and(eq(chatRead.channelId, chatMessage.channelId), eq(chatRead.userId, userId)),
    )
    .where(
      and(
        inArray(chatMessage.channelId, channelIds),
        ne(chatMessage.authorId, userId),
        isNull(chatMessage.deletedAt),
        sql`${chatMessage.id} > coalesce(${chatRead.lastReadId}, 0)`,
      ),
    )
    .groupBy(chatMessage.channelId);
  return new Map(rows.map((r) => [r.channelId, r.n]));
}

/** Total unread messages across the member's channels (for the header badge). */
export async function unreadTotal(userId: string): Promise<number> {
  const items = await listInbox(userId);
  return items.reduce((n, i) => n + i.unread, 0);
}

// --- Messages ---------------------------------------------------------------------------

/**
 * A page of messages, oldest first. `before`: older history; `after`: what a reconnecting stream
 * missed. Callers check access with channelFor first.
 */
export async function listMessages(
  channelId: string,
  opts: { before?: number; after?: number; limit?: number } = {},
): Promise<{ messages: ChatMessage[]; hasOlder: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? PAGE, 1), 100);
  const where = [eq(chatMessage.channelId, channelId)];
  if (opts.before) where.push(lt(chatMessage.id, opts.before));
  if (opts.after) where.push(gt(chatMessage.id, opts.after));
  const rows = await db()
    .select(messageColumns)
    .from(chatMessage)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, chatMessage.authorId))
    .innerJoin(user, eq(user.id, chatMessage.authorId))
    .where(and(...where))
    .orderBy(opts.after ? chatMessage.id : desc(chatMessage.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit).map(toMessage);
  return {
    messages: opts.after ? page : page.reverse(),
    hasOlder: !opts.after && rows.length > limit,
  };
}

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; error: ChatError };

/** Saves a message and pushes it to every open stream on the channel. */
export async function sendMessage(
  userId: string,
  channelId: string,
  input: string,
): Promise<SendResult> {
  const body = input
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!body) return { ok: false, error: "empty" };
  if (body.length > MESSAGE_MAX) return { ok: false, error: "too_long" };
  const [me] = await db().select({ banned: user.banned }).from(user).where(eq(user.id, userId));
  if (!me || me.banned) return { ok: false, error: "banned" };
  const channel = await channelFor(channelId, userId);
  if (!channel) return { ok: false, error: "forbidden" };
  const limited = await slidingWindow(
    `chat:send:${userId}`,
    SEND_LIMIT.limit,
    SEND_LIMIT.windowSeconds,
  );
  if (!limited.ok) return { ok: false, error: "rate_limited" };

  const id = await db().transaction(async (tx) => {
    const [row] = await tx
      .insert(chatMessage)
      .values({ channelId, authorId: userId, body })
      .returning({ id: chatMessage.id, createdAt: chatMessage.createdAt });
    await tx
      .update(chatChannel)
      .set({ lastMessageAt: row!.createdAt })
      .where(eq(chatChannel.id, channelId));
    await markReadTx(tx, userId, channelId, row!.id);
    return row!.id;
  });
  const message = (await getMessage(id))!;
  await publish(channelId, { type: "message", message: toWire(message) });
  await notifyMentions(message, channel);
  return { ok: true, message };
}

const MENTION = /(?:^|[^\p{L}\p{N}_@])@([a-z0-9][a-z0-9_-]{2,23})/giu;

/** Handles mentioned as @handle, lowercased, at most 10. */
export function mentionedHandles(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(MENTION)) {
    found.add(m[1]!.toLowerCase().replace(/[-_]+$/, ""));
    if (found.size >= 10) break;
  }
  return [...found];
}

/** People @mentioned who can read the channel get a notification linking to the message. */
async function notifyMentions(message: ChatMessage, channel: ChannelInfo) {
  const handles = mentionedHandles(message.body);
  if (!handles.length) return;
  const people = await db()
    .select({ userId: creatorProfile.userId })
    .from(creatorProfile)
    .where(inArray(creatorProfile.handle, handles));
  const inside = (
    await Promise.all(
      people.map(async (p) => ((await stillInChannel(channel.id, p.userId)) ? p.userId : null)),
    )
  ).filter((u): u is string => !!u && u !== message.authorId);
  await notify(
    inside.map((userId) => ({
      userId,
      kind: "mention" as const,
      actorId: message.authorId,
      data: {
        channelId: channel.id,
        messageId: String(message.id),
        where: channel.kind === "crew" ? channel.title : "a direct message",
        name: message.displayName,
        excerpt: message.body.slice(0, 140),
      },
      dedupeKey: `mention:${message.id}`,
    })),
  );
}

export async function getMessage(id: number): Promise<ChatMessage | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const [row] = await db()
    .select(messageColumns)
    .from(chatMessage)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, chatMessage.authorId))
    .innerJoin(user, eq(user.id, chatMessage.authorId))
    .where(eq(chatMessage.id, id));
  return row ? toMessage(row) : null;
}

/** The author removes their own message; staff remove any (logged in the audit log). */
export async function deleteMessage(
  actor: Actor,
  id: number,
): Promise<{ ok: true } | { ok: false; error: ChatError }> {
  const m = await getMessage(id);
  if (!m || m.deleted) return { ok: false, error: "not_found" };
  const own = m.authorId === actor.id;
  if (!own && !isStaff(actor)) return { ok: false, error: "forbidden" };
  await db().transaction(async (tx) => {
    await tx
      .update(chatMessage)
      .set({ body: "", deletedAt: new Date(), deletedBy: own ? "author" : "staff" })
      .where(eq(chatMessage.id, id));
    if (!own)
      await audit(
        actor.id,
        {
          action: "message.remove",
          targetType: "message",
          targetId: String(id),
          meta: { channelId: m.channelId, authorId: m.authorId, excerpt: m.body.slice(0, 200) },
        },
        tx,
      );
  });
  await publish(m.channelId, { type: "delete", id });
  return { ok: true };
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

async function markReadTx(
  tx: Tx | ReturnType<typeof db>,
  userId: string,
  channelId: string,
  id: number,
) {
  await tx
    .insert(chatRead)
    .values({ channelId, userId, lastReadId: id })
    .onConflictDoUpdate({
      target: [chatRead.channelId, chatRead.userId],
      set: { lastReadId: sql`greatest(${chatRead.lastReadId}, ${id})` },
    });
}

/** Moves the member's read marker forward (never back). */
export async function markRead(userId: string, channelId: string, id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id < 1) return;
  if (!(await channelFor(channelId, userId))) return;
  await markReadTx(db(), userId, channelId, id);
}

/** Cheap re-check for an open stream: is the member still in this channel? */
export async function stillInChannel(channelId: string, userId: string): Promise<boolean> {
  const [ch] = await db()
    .select({ kind: chatChannel.kind, crewId: chatChannel.crewId })
    .from(chatChannel)
    .where(eq(chatChannel.id, channelId));
  if (!ch) return false;
  const [row] =
    ch.kind === "crew" && ch.crewId
      ? await db()
          .select({ u: crewMember.userId })
          .from(crewMember)
          .where(and(eq(crewMember.crewId, ch.crewId), eq(crewMember.userId, userId)))
      : await db()
          .select({ u: chatParticipant.userId })
          .from(chatParticipant)
          .where(and(eq(chatParticipant.channelId, channelId), eq(chatParticipant.userId, userId)));
  return !!row;
}
