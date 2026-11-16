import { sql } from "drizzle-orm";
import {
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
    /** A key from BANNERS (creators module); unknown keys read as DEFAULT_BANNER. */
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
