import type { Platform } from "@plunderclips/ui/components/platform-icon";

/** How each auth provider is shown. Google is presented as YouTube: that is what streamers link it for. */
export const providerMeta = {
  twitch: { label: "Twitch", icon: "twitch" },
  discord: { label: "Discord", icon: "discord" },
  kick: { label: "Kick", icon: "kick" },
  google: { label: "YouTube", icon: "youtube" },
} as const satisfies Record<string, { label: string; icon: Platform }>;

export type ProviderKey = keyof typeof providerMeta;

export function isProviderKey(id: string): id is ProviderKey {
  return id in providerMeta;
}
