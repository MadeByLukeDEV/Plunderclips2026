import { get, type FetchLike } from "./http";
import { parseClipUrl, type ParseResult } from "./parse";

const SHORT_LINK_HOSTS = ["vm.tiktok.com", "vt.tiktok.com", "www.tiktok.com"];

/**
 * parseClipUrl, plus following TikTok short links (vm./vt./t/) to the real video URL.
 * Redirects are followed by hand, at most 3 hops, and only between TikTok hosts.
 */
export async function resolveClipUrl(
  input: string,
  opts: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<ParseResult> {
  let result = parseClipUrl(input);
  for (let hop = 0; hop < 3 && result.ok && result.clip.needsResolve; hop++) {
    const res = await get(result.clip.canonicalUrl, {
      fetch: (url, init) => (opts.fetch ?? fetch)(url, { ...init, redirect: "manual" }),
      timeoutMs: opts.timeoutMs ?? 5000,
      allowedHosts: SHORT_LINK_HOSTS,
    }).catch(() => null);
    const location = res?.headers.get("location");
    if (!location) return { ok: false, error: "unsupported_url" };
    const next = new URL(location, result.clip.canonicalUrl).toString();
    result = parseClipUrl(next);
    if (result.ok && result.clip.platform !== "tiktok")
      return { ok: false, error: "unsupported_url" };
  }
  if (result.ok && result.clip.needsResolve) return { ok: false, error: "unsupported_url" };
  return result;
}
