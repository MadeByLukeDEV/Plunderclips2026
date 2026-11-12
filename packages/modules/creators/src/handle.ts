/** Words a handle can't be: they'd read as site pages or staff. */
const RESERVED = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "auth",
  "c",
  "clip",
  "clips",
  "creator",
  "creators",
  "crew",
  "crews",
  "dashboard",
  "edit",
  "help",
  "login",
  "logout",
  "mod",
  "mods",
  "moderator",
  "new",
  "null",
  "plunderclips",
  "rare",
  "root",
  "seaofthieves",
  "settings",
  "sign-in",
  "signin",
  "staff",
  "submit",
  "support",
  "system",
  "undefined",
]);

const HANDLE = /^[a-z0-9][a-z0-9_-]{2,23}$/;

export type HandleError = "too_short" | "too_long" | "invalid_chars" | "reserved";

/** Normalises and checks a handle: lowercase, 3-24 chars of a-z 0-9 _ -, starting with a letter or digit. */
export function checkHandle(
  input: string,
): { ok: true; handle: string } | { ok: false; error: HandleError } {
  const handle = input.trim().replace(/^@/, "").toLowerCase();
  if (handle.length < 3) return { ok: false, error: "too_short" };
  if (handle.length > 24) return { ok: false, error: "too_long" };
  if (!HANDLE.test(handle) || /[-_]{2}/.test(handle) || /[-_]$/.test(handle))
    return { ok: false, error: "invalid_chars" };
  if (RESERVED.has(handle) || RESERVED.has(handle.replace(/[-_]/g, "")))
    return { ok: false, error: "reserved" };
  return { ok: true, handle };
}

/** A handle suggestion from a display name ("Captain Ahab!" → "captain-ahab"). Not checked for uniqueness. */
export function suggestHandle(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/, "");
  const ok = checkHandle(base);
  return ok.ok ? ok.handle : `crew-${Math.random().toString(36).slice(2, 8)}`;
}
