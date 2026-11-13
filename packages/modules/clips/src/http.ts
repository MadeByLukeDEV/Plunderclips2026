export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const USER_AGENT = "Mozilla/5.0 (compatible; PlunderclipsBot/1.0)";

export type GetOptions = {
  fetch: FetchLike;
  timeoutMs: number;
  /** Hosts the request (and every redirect it follows) may end on. */
  allowedHosts: string[];
  maxBytes?: number;
  accept?: string;
  headers?: Record<string, string>;
  /** false: return a 3xx as-is (the caller reads Location itself). Default true. */
  followRedirects?: boolean;
};

const MAX_REDIRECTS = 3;

/**
 * GET with a timeout, a body size cap and a host allowlist checked on every hop.
 * Only ever called with URLs we build ourselves from parsed parts, never the raw user input.
 *
 * Redirects are followed by hand: with native `redirect: "follow"` the runtime would request each
 * hop before we could look at it, so a redirect from an allowed host could make the server fetch
 * any address (internal ones included). Here a hop off the allowlist is never requested.
 */
export async function get(url: string, o: GetOptions): Promise<Response | null> {
  const signal = AbortSignal.timeout(o.timeoutMs);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!hostAllowed(current, o.allowedHosts)) return null;
    const res = await o.fetch(current, {
      headers: { "user-agent": USER_AGENT, accept: o.accept ?? "*/*", ...o.headers },
      redirect: "manual",
      signal,
    });
    if (res.status < 300 || res.status >= 400 || o.followRedirects === false) return res;
    const location = res.headers.get("location");
    await res.body?.cancel().catch(() => {});
    if (!location) return null;
    try {
      current = new URL(location, current).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export async function getJson(url: string, o: GetOptions): Promise<unknown> {
  const res = await get(url, { accept: "application/json", ...o });
  if (!res?.ok) return null;
  const text = await readCapped(res, o.maxBytes ?? 256 * 1024);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function getText(url: string, o: GetOptions): Promise<string | null> {
  const res = await get(url, { accept: "text/html,application/xhtml+xml", ...o });
  if (!res?.ok) return null;
  return readCapped(res, o.maxBytes ?? 1024 * 1024);
}

/** Reads at most maxBytes. Longer bodies are cut (enough for <head> meta tags), not rejected. */
async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    const part = c.subarray(0, all.length - offset);
    all.set(part, offset);
    offset += part.length;
    if (offset >= all.length) break;
  }
  return new TextDecoder().decode(all);
}

function hostAllowed(url: string, allowed: string[]): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && allowed.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Accepts only absolute https URLs (thumbnails, author links). */
export function httpsUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function str(v: unknown, max = 300): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
}
