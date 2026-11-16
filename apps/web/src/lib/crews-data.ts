import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import {
  getCrewBySlug,
  listCrewMembers,
  listCrews,
  listLfcPosts,
  nextPublicSessions,
  type CrewSort,
  type LfcFilter,
} from "@plunderclips/social";

/**
 * Cached reads for crew pages. Tags: "crews" (every list), "crew:<slug>" (one page). Every crew
 * action expires both, and "creators" changes (a renamed or deleted profile) expire "crews" too.
 */
export async function crewPage(slug: string) {
  "use cache";
  cacheTag("crews", "creators", `crew:${slug.toLowerCase()}`);
  cacheLife("minutes");
  const crew = await getCrewBySlug(slug);
  if (!crew) return null;
  const [members, sessions] = await Promise.all([
    listCrewMembers(crew.id),
    nextPublicSessions(crew.id),
  ]);
  return { crew, members, sessions };
}

export async function crewsList(sort: CrewSort) {
  "use cache";
  cacheTag("crews");
  cacheLife("minutes");
  return listCrews({ sort });
}

/** Open looking-for-crew posts for a filter. Tag "lfc"; posting or closing expires it. */
export async function lfcList(filter: LfcFilter) {
  "use cache";
  cacheTag("lfc", "creators");
  cacheLife("minutes");
  return listLfcPosts(filter);
}
