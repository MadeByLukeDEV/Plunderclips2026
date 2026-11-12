import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./identity";

export const clipPlatform = pgEnum("clip_platform", [
  "twitch",
  "youtube",
  "kick",
  "medal",
  "tiktok",
  "x",
]);
export const clipKind = pgEnum("clip_kind", ["clip", "video", "short", "live", "post"]);
export const clipStatus = pgEnum("clip_status", ["pending", "approved", "rejected"]);

export const clip = pgTable(
  "clip",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** platform:kind:id from the URL parser. One row per clip, whoever submits it. */
    key: text().notNull().unique(),
    platform: clipPlatform().notNull(),
    kind: clipKind().notNull(),
    platformId: text().notNull(),
    channel: text(),
    canonicalUrl: text().notNull(),
    /** Player src from the platform's metadata (YouTube clips, Kick, Medal). Others are built from platformId. */
    embedSrc: text(),
    startSeconds: integer(),

    title: text().notNull(),
    thumbnailUrl: text(),
    authorName: text(),
    authorUrl: text(),
    durationSeconds: integer(),
    game: text(),
    /** null when the platform doesn't say which game it is. */
    isSeaOfThieves: boolean(),
    /** Tag slugs from CLIP_TAGS (clips module), set by mods. */
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    status: clipStatus().notNull().default("pending"),
    submittedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    /** Salted hash, never the raw IP. Used for rate limits and abuse review. */
    submitterIpHash: text(),
    submitterNote: text(),

    reviewedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp(),
    rejectReason: text(),
    approvedAt: timestamp(),

    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("clip_status_created_idx").on(t.status, t.createdAt),
    index("clip_submitted_by_idx").on(t.submittedByUserId),
    index("clip_channel_idx").on(t.platform, t.channel),
    index("clip_approved_idx")
      .on(t.approvedAt, t.id)
      .where(sql`${t.status} = 'approved'`),
    index("clip_tags_idx").using("gin", t.tags),
  ],
);

/** weekly: picks per ISO week (period "2026-W46") · curated: one standing list (period ""). */
export const sectionKind = pgEnum("section_kind", ["weekly", "curated"]);

export const section = pgTable("section", {
  slug: text().primaryKey(),
  title: text().notNull(),
  blurb: text().notNull(),
  kind: sectionKind().notNull(),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp().defaultNow().notNull(),
});

export const clipSection = pgTable(
  "clip_section",
  {
    clipId: text()
      .notNull()
      .references(() => clip.id, { onDelete: "cascade" }),
    sectionSlug: text()
      .notNull()
      .references(() => section.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    period: text().notNull().default(""),
    position: integer().notNull().default(0),
    addedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    addedAt: timestamp().defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sectionSlug, t.period, t.clipId] }),
    index("clip_section_clip_idx").on(t.clipId),
  ],
);

export type Clip = typeof clip.$inferSelect;
export type NewClip = typeof clip.$inferInsert;
