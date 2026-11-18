import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/**
 * Public pages are open to every crawler, AI search included (GEO). Account, staff, chat and
 * crew-private pages stay out; they're behind sign-in anyway and carry noindex.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/chat",
          "/notifications",
          "/sign-in",
          "/crews/new",
          "/crews/*/settings",
          "/crews/*/board",
          "/crews/*/calendar",
          "/looking-for-crew/new",
        ],
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
  };
}
