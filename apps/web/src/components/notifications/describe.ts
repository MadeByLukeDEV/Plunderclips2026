import type { Notification } from "@plunderclips/notifications";

/** A notification as the bell and the page show it: one sentence and where it leads. */
export type NotificationView = {
  id: number;
  text: string;
  detail: string | null;
  href: string;
  read: boolean;
  createdAt: string;
  image: string | null;
};

export function toView(n: Notification): NotificationView {
  const base = {
    id: n.id,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
    image: n.actor?.image ?? null,
  };
  switch (n.kind) {
    case "clip_approved":
      return {
        ...base,
        text: `Your clip is live: ${n.data.title}`,
        detail: null,
        href: `/clip/${n.data.clipId}`,
      };
    case "clip_rejected":
      return {
        ...base,
        text: `Your clip wasn't approved: ${n.data.title}`,
        detail: n.data.reason || null,
        href: "/dashboard/clips",
      };
    case "new_follower":
      return {
        ...base,
        text: `${n.data.name} followed you`,
        detail: null,
        href: n.data.handle ? `/c/${n.data.handle}` : "/dashboard",
      };
    case "crew_request":
      return {
        ...base,
        text: `${n.data.name} asked to join ${n.data.crew}`,
        detail: null,
        href: `/crews/${n.data.slug}`,
      };
    case "crew_accepted":
      return {
        ...base,
        text: `You're in ${n.data.crew}`,
        detail: null,
        href: `/crews/${n.data.slug}`,
      };
    case "mention":
      return {
        ...base,
        text: `${n.data.name} mentioned you in ${n.data.where}`,
        detail: n.data.excerpt,
        href: `/chat/${n.data.channelId}`,
      };
  }
}
