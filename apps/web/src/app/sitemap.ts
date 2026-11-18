import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { listClipsForSitemap, listSections } from "@plunderclips/clips";
import { listProfilesForSitemap } from "@plunderclips/creators";
import { listCrewsForSitemap } from "@plunderclips/social";
import { siteUrl } from "@/lib/seo";

async function entries(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheTag("sitemap", "clips", "creators", "crews");
  cacheLife("hours");
  const [clips, sections, creators, crews] = await Promise.all([
    listClipsForSitemap(),
    listSections(),
    listProfilesForSitemap(),
    listCrewsForSitemap(),
  ]);
  const now = new Date();
  return [
    { url: siteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: siteUrl("/clips"), lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    ...sections.map((s) => ({
      url: siteUrl(`/clips/${s.slug}`),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    { url: siteUrl("/creators"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: siteUrl("/crews"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    {
      url: siteUrl("/looking-for-crew"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    },
    { url: siteUrl("/submit"), changeFrequency: "monthly", priority: 0.5 },
    ...clips.map((c) => ({
      url: siteUrl(`/clip/${c.id}`),
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...creators.map((c) => ({
      url: siteUrl(`/c/${c.handle}`),
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...crews.map((c) => ({
      url: siteUrl(`/crews/${c.slug}`),
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}

/** Built on request (not at build time, which has no database), cached for an hour. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  return entries();
}
