import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { listClipsByChannels } from "@plunderclips/clips";
import {
  authorUrls,
  getProfileByHandle,
  listProfiles,
  type ProfileSort,
} from "@plunderclips/creators";

/**
 * Cached reads for creator pages. Tags: "creators" (every list), "creator:<handle>" (one page),
 * and "clips" (their clip grid). The profile editor expires the first two on save.
 */
export async function creatorPage(handle: string, cursor: string | null) {
  "use cache";
  cacheTag("creators", `creator:${handle.toLowerCase()}`, "clips");
  cacheLife("minutes");
  const profile = await getProfileByHandle(handle);
  if (!profile) return null;
  const clips = await listClipsByChannels(
    profile.channels.map((c) => ({ ...c, authorUrls: authorUrls(c) })),
    { cursor },
  );
  return { profile, clips };
}

export async function creatorsList(sort: ProfileSort) {
  "use cache";
  cacheTag("creators");
  cacheLife("minutes");
  return listProfiles({ sort });
}
