/** Absolute site URL (build-time SITE_URL, like metadataBase), without a trailing slash. */
export function siteUrl(path = ""): string {
  const base = (
    process.env.SITE_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  return `${base}${path}`;
}

export const SITE_NAME = "Plunderclips";
export const SITE_DESCRIPTION =
  "Share Sea of Thieves clips from Twitch, YouTube and Kick without an account. Weekly picks, best-of reels and streamers to sail with.";

/** ISO 8601 duration ("PT1M5S") for schema.org. */
export function isoDuration(seconds: number | null | undefined): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

/** JSON's six-character escape for "<" (\u003c), so "</script>" can never appear inside the block. */
const ESCAPED_LT = String.raw`\u003c`;

/**
 * A JSON-LD block. `<` is escaped so a title like "</script>" can't end the script early; the
 * data is ours (titles and names members typed), never raw HTML.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, ESCAPED_LT) }}
    />
  );
}

export function breadcrumbs(items: [name: string, path: string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: siteUrl(path),
    })),
  };
}
