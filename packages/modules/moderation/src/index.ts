/**
 * @plunderclips/moderation — Review queue, reports, bans, audit log.
 *
 * Public API of this module. Other modules and the web app may import ONLY
 * from "@plunderclips/moderation"; deep imports into src/ are blocked by ESLint.
 *
 * Every write takes an Actor and checks its permissions again, so a page or action that forgets
 * its own check still can't do more than the role allows.
 */
export const MODULE_NAME = "moderation" as const;

export {
  ForbiddenError,
  canReview,
  canFeature,
  canTriageReports,
  canBan,
  canSetRoles,
  isStaff,
  type Actor,
} from "./actor";
export { audit, listAudit, type AuditEntry, type AuditRow } from "./audit";
export {
  listQueue,
  queueCounts,
  reviewClip,
  listSectionPicks,
  arrangeSection,
  REJECT_REASONS,
  type QueueClip,
  type QueueStatus,
  type ReviewInput,
  type ReviewResult,
  type RejectReason,
  type SectionPick,
  type SectionPickRow,
} from "./review";
export {
  createReport,
  listOpenReports,
  openReportCount,
  resolveReports,
  isReportReason,
  REPORT_REASONS,
  REPORT_LIMIT,
  type ReportReason,
  type ReportTarget,
  type Reporter,
  type ReportGroup,
  type CreateReportResult,
  type ResolveInput,
} from "./reports";
export { listUsers, setBan, setRoles, type UserRow, type UserActionResult } from "./users";
