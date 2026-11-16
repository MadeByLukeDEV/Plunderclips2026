/**
 * @plunderclips/notifications — In-app notifications and their live channel.
 *
 * Public API of this module. Other modules and the web app may import ONLY
 * from "@plunderclips/notifications"; deep imports into src/ are blocked by ESLint.
 * It depends only on db and shared, so any module can notify without import cycles.
 */
export const MODULE_NAME = "notifications" as const;

export {
  insertNotifications,
  announce,
  notify,
  unreadCount,
  listNotifications,
  markRead,
  subscribeNotifications,
  type Notification,
  type NotificationKind,
  type NotificationData,
  type NewNotification,
} from "./notifications";
