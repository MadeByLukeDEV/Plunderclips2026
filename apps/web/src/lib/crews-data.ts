import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getCrewBySlug, listCrewMembers, listCrews, type CrewSort } from "@plunderclips/social";

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
  return { crew, members: await listCrewMembers(crew.id) };
}

export async function crewsList(sort: CrewSort) {
  "use cache";
  cacheTag("crews");
  cacheLife("minutes");
  return listCrews({ sort });
}
