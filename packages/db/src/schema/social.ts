import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { user } from "./identity";

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
    /** A key from BANNERS (creators module); unknown keys read as DEFAULT_BANNER. */
    banner: text().notNull().default("ninth-wave"),
    /** Uploaded banner and logo (media keys); the banner wins over `banner` when set. */
    bannerImage: text(),
    logoImage: text(),
    joinPolicy: crewJoinPolicy().notNull().default("request"),
    /** A 7TV emote set the captain attached; its emotes join the crew channel's. */
    sevenTvSetId: text(),
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

// --- Collab: crew board, sessions, looking-for-crew ----------------------------------

export const boardStatus = pgEnum("board_status", ["idea", "planned", "done"]);

/** Ideas and plans on a crew's private board. */
export const crewBoardItem = pgTable(
  "crew_board_item",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    crewId: text()
      .notNull()
      .references(() => crew.id, { onDelete: "cascade" }),
    authorId: text().references(() => user.id, { onDelete: "set null" }),
    title: text().notNull(),
    notes: text().notNull().default(""),
    status: boardStatus().notNull().default("idea"),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("crew_board_crew_idx").on(t.crewId, t.status)],
);

/** A scheduled crew session (a stream, a collab, a voyage). Times are UTC. */
export const crewSession = pgTable(
  "crew_session",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    crewId: text()
      .notNull()
      .references(() => crew.id, { onDelete: "cascade" }),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    title: text().notNull(),
    notes: text().notNull().default(""),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    durationMin: integer().notNull().default(120),
    /** Public sessions show on the crew page for everyone. */
    isPublic: boolean().notNull().default(false),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (t) => [index("crew_session_crew_idx").on(t.crewId, t.startsAt)],
);

export const rsvpStatus = pgEnum("rsvp_status", ["going", "maybe"]);

export const crewSessionRsvp = pgTable(
  "crew_session_rsvp",
  {
    sessionId: text()
      .notNull()
      .references(() => crewSession.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => creatorProfile.userId, { onDelete: "cascade" }),
    status: rsvpStatus().notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] })],
);

export const lfcRegion = pgEnum("lfc_region", ["eu", "na", "sa", "oce", "asia", "any"]);
export const lfcPlatform = pgEnum("lfc_platform", ["pc", "xbox", "playstation", "any"]);
export const lfcShip = pgEnum("lfc_ship", ["sloop", "brigantine", "galleon", "any"]);

/** Public "looking for crew" posts: a creator looking for a crew, or a crew recruiting. */
export const lfcPost = pgTable(
  "lfc_post",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    authorId: text()
      .notNull()
      .references(() => creatorProfile.userId, { onDelete: "cascade" }),
    /** Set when a captain or officer posts for their crew ("recruiting"). */
    crewId: text().references(() => crew.id, { onDelete: "cascade" }),
    title: text().notNull(),
    body: text().notNull().default(""),
    region: lfcRegion().notNull().default("any"),
    platform: lfcPlatform().notNull().default("any"),
    ship: lfcShip().notNull().default("any"),
    styles: text().array().notNull().default(sql`'{}'::text[]`),
    /** Free text: "weekday evenings CET". */
    availability: text().notNull().default(""),
    createdAt: timestamp().defaultNow().notNull(),
    expiresAt: timestamp().notNull(),
  },
  (t) => [
    index("lfc_post_expires_idx").on(t.expiresAt),
    index("lfc_post_author_idx").on(t.authorId),
  ],
);
