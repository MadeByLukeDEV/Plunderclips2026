/** Reads OpenGraph / Twitter card meta tags from an HTML document. No DOM needed. */
export function readMetaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const end = html.search(/<\/head>/i);
  const head = end > 0 ? html.slice(0, end) : html;
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = attributes(tag);
    const key = (
      attrs.get("property") ??
      attrs.get("name") ??
      attrs.get("itemprop")
    )?.toLowerCase();
    const content = attrs.get("content");
    if (key && content !== undefined && !out.has(key)) out.set(key, decodeEntities(content));
  }
  return out;
}

function attributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const m of tag.matchAll(re)) attrs.set(m[1]!.toLowerCase(), m[2] ?? m[3] ?? m[4] ?? "");
  return attrs;
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED[e.toLowerCase()] ?? whole;
  });
}

/** Plain text of an HTML fragment (used for X post text in its oEmbed blockquote). */
export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
