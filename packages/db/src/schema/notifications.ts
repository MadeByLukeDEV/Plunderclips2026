import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./identity";

export const notificationKind = pgEnum("notification_kind", [
  "clip_approved",
  "clip_rejected",
  "new_follower",
  "crew_request",
  "crew_accepted",
  "mention",
  "session_scheduled",
]);

/** In-app notifications. Payload fields are a snapshot (titles, names) so a row reads on its own. */
export const notification = pgTable(
  "notification",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: notificationKind().notNull(),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    data: jsonb().$type<Record<string, string>>().notNull().default({}),
    /** Same key while unread = one notification (a follow, unfollow, follow again doesn't stack). */
    dedupeKey: text(),
    readAt: timestamp(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (t) => [
    index("notification_user_idx").on(t.userId, t.id),
    index("notification_unread_idx")
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    uniqueIndex("notification_dedupe_idx")
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.readAt} is null and ${t.dedupeKey} is not null`),
  ],
);
