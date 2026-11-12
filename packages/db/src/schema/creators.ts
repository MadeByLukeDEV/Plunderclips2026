import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { clipPlatform } from "./clips";
import { user } from "./identity";

/** A member's public creator page at /c/<handle>. One per user. */
export const creatorProfile = pgTable(
  "creator_profile",
  {
    userId: text()
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Lowercase, 3-24 chars of a-z 0-9 _ - (validated in the creators module). */
    handle: text().notNull(),
    displayName: text().notNull(),
    bio: text().notNull().default(""),
    /** One of the public-domain paintings in BANNERS (creators module). */
    banner: text().notNull().default("ninth-wave"),
    /** Denormalised from creator_follow, kept in step by follow(). */
    followerCount: integer().notNull().default(0),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("creator_profile_handle_idx").on(t.handle),
    check("creator_profile_handle_lower", sql`${t.handle} = lower(${t.handle})`),
    index("creator_profile_followers_idx").on(t.followerCount),
  ],
);

/** Channels a creator lists on their page, one per platform. Matched against clip.channel. */
export const creatorChannel = pgTable(
  "creator_channel",
  {
    userId: text()
      .notNull()
      .references(() => creatorProfile.userId, { onDelete: "cascade" }),
    platform: clipPlatform().notNull(),
    /** Lowercase channel name on that platform (no @). */
    handle: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.platform] }),
    index("creator_channel_lookup_idx").on(t.platform, t.handle),
  ],
);

export const creatorFollow = pgTable(
  "creator_follow",
  {
    followerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    creatorId: text()
      .notNull()
      .references(() => creatorProfile.userId, { onDelete: "cascade" }),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.creatorId] }),
    index("creator_follow_creator_idx").on(t.creatorId),
  ],
);
