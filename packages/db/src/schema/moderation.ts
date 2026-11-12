import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./identity";

export const reportTarget = pgEnum("report_target", ["clip", "creator"]);
export const reportReason = pgEnum("report_reason", [
  "not_sot",
  "stolen",
  "spam",
  "harassment",
  "impersonation",
  "other",
]);
export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);

/** A visitor flagging a clip or a creator page. */
export const report = pgTable(
  "report",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    targetType: reportTarget().notNull(),
    /** clip.id, or creator_profile.user_id */
    targetId: text().notNull(),
    reason: reportReason().notNull(),
    note: text(),
    reporterUserId: text().references(() => user.id, { onDelete: "set null" }),
    /** "u:<id>" or "ip:<salted hash>": one open report per reporter and target. */
    reporterKey: text().notNull(),
    status: reportStatus().notNull().default("open"),
    resolvedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp(),
    resolution: text(),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (t) => [
    index("report_status_created_idx").on(t.status, t.createdAt),
    index("report_target_idx").on(t.targetType, t.targetId),
    uniqueIndex("report_open_once_idx")
      .on(t.targetType, t.targetId, t.reporterKey)
      .where(sql`${t.status} = 'open'`),
  ],
);

/** Every moderation action, who did it, to what. Append-only. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorUserId: text().references(() => user.id, { onDelete: "set null" }),
    /** e.g. clip.approve, clip.reject, clip.update, section.add, report.dismiss, user.ban, user.role */
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text().notNull(),
    meta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp().defaultNow().notNull(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_target_idx").on(t.targetType, t.targetId),
    index("audit_actor_idx").on(t.actorUserId),
  ],
);
