/** Only same-site relative paths are allowed as post-login targets (blocks open redirects like //evil.example). */
export function safeNext(value: string | string[] | undefined, fallback = "/dashboard"): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  return v;
}
