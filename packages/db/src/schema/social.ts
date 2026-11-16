import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { creatorProfile } from "./creators";

export const crewJoinPolicy = pgEnum("crew_join_policy", ["open", "request"]);
export const crewRole = pgEnum("crew_role", ["captain", "officer", "deckhand"]);

/** A group of creators with a public page at /crews/<slug>. */
export const crew = pgTable(
  "crew",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Same rules as creator handles (validated in the social module). */
    slug: text().notNull(),
    name: text().notNull(),
    motto: text().notNull().default(""),
    /** One of the public-domain paintings in BANNERS (creators module). */
    banner: text().notNull().default("ninth-wave"),
    joinPolicy: crewJoinPolicy().notNull().default("request"),
    /** Kept in step with crew_member by the social module, inside the same transaction. */
    memberCount: integer().notNull().default(0),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("crew_slug_idx").on(t.slug),
    check("crew_slug_lower", sql`${t.slug} = lower(${t.slug})`),
    index("crew_members_idx").on(t.memberCount),
  ],
);

export const crewMember = pgTable(
  "crew_member",
  {
    crewId: text()
      .notNull()
      .references(() => crew.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => creatorProfile.userId, { onDelete: "cascade" }),
    role: crewRole().notNull().default("deckhand"),
    joinedAt: timestamp().defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.crewId, t.userId] }),
    index("crew_member_user_idx").on(t.userId),
    /** One captain per crew. */
    uniqueIndex("crew_one_captain_idx")
      .on(t.crewId)
      .where(sql`${t.role} = 'captain'`),
  ],
);

/** A pending request to join a crew whose policy is "request". Deleted when answered. */
export const crewRequest = pgTable(
  "crew_request",
  {
    crewId: text()
      .notNull()
      .references(() => crew.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => creatorProfile.userId, { onDelete: "cascade" }),
    message: text().notNull().default(""),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.crewId, t.userId] }),
    index("crew_request_user_idx").on(t.userId),
  ],
);

// --- Chat -------------------------------------------------------------------------

export const chatKind = pgEnum("chat_kind", ["crew", "dm"]);

/**
 * A conversation: one per crew (access follows crew membership) or one per pair of creators
 * (access through chat_participant).
 */
export const chatChannel = pgTable(
  "chat_channel",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    kind: chatKind().notNull(),
    crewId: text().references(() => crew.id, { onDelete: "cascade" }),
    /** "<userId>|<userId>", sorted, for direct messages: one channel per pair. */
    dmKey: text(),
    lastMessageAt: timestamp(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("chat_channel_crew_idx").on(t.crewId),
    uniqueIndex("chat_channel_dm_idx").on(t.dmKey),
    check(
      "chat_channel_shape",
      sql`(${t.kind} = 'crew' and ${t.crewId} is not null and ${t.dmKey} is null) or (${t.kind} = 'dm' and ${t.dmKey} is not null and ${t.crewId} is null)`,
    ),
  ],
);

/** The two people in a direct-message channel. */
export const chatParticipant = pgTable(
  "chat_participant",
  {
    channelId: text()
      .notNull()
      .references(() => chatChannel.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => creatorProfile.userId, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.channelId, t.userId] }),
    index("chat_participant_user_idx").on(t.userId),
  ],
);

export const chatMessage = pgTable(
  "chat_message",
  {
    /** Increasing: orders a channel and resumes a dropped stream (SSE Last-Event-ID). */
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    channelId: text()
      .notNull()
      .references(() => chatChannel.id, { onDelete: "cascade" }),
    authorId: text()
      .notNull()
      .references(() => creatorProfile.userId, { onDelete: "cascade" }),
    /** Emptied when the message is removed; deletedBy says who removed it. */
    body: text().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    deletedAt: timestamp(),
    deletedBy: text(),
  },
  (t) => [index("chat_message_channel_idx").on(t.channelId, t.id)],
);

/** How far each member has read a channel, for unread counts. */
export const chatRead = pgTable(
  "chat_read",
  {
    channelId: text()
      .notNull()
      .references(() => chatChannel.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => creatorProfile.userId, { onDelete: "cascade" }),
    lastReadId: bigint({ mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);
