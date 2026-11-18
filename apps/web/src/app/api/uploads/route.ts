import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import {
  clearProfileBannerImage,
  getProfileByUser,
  setProfileBannerImage,
} from "@plunderclips/creators";
import { getSession, rolesOf } from "@plunderclips/identity";
import { mediaEnabled, MAX_UPLOAD_BYTES } from "@plunderclips/media";
import { logger, slidingWindow } from "@plunderclips/shared";
import { clearCrewImage, setCrewImage } from "@plunderclips/social";

/**
 * Image uploads: POST (multipart, field "file") sets, DELETE removes.
 *   ?target=profile-banner
 *   ?target=crew-banner&crew=<id>   ?target=crew-logo&crew=<id>
 * The image is decoded and re-encoded on the server (see @plunderclips/media); the browser's
 * file type is never trusted. Permissions are checked again in the modules.
 */
const TARGETS = ["profile-banner", "crew-banner", "crew-logo"] as const;
type Target = (typeof TARGETS)[number];

const json = (body: unknown, status = 200) => Response.json(body, { status });
const MESSAGES: Record<string, string> = {
  too_large: "That file is over 8 MB.",
  not_an_image: "That doesn't look like an image. Use a JPEG, PNG, WebP, AVIF or GIF.",
  too_small: "That image is too small. Banners need at least 400 pixels across, logos 64.",
  forbidden: "Only the captain can change the crew's images.",
  not_found: "Nothing to change there.",
  no_profile: "Make your creator page first.",
  storage: "The upload didn't save. Try again in a minute.",
};

async function who(req: Request, bucket: string) {
  await connection();
  if (!mediaEnabled())
    return { error: json({ error: "Uploads are switched off on this site." }, 503) };
  const session = await getSession(req.headers);
  if (!session) return { error: json({ error: "Sign in first." }, 401) };
  if ((session.user as { banned?: boolean | null }).banned)
    return { error: json({ error: "Your account can't upload images." }, 403) };
  const limited = await slidingWindow(`upload:${bucket}:${session.user.id}`, 20, 60 * 60);
  if (!limited.ok)
    return { error: json({ error: "That's a lot of uploads. Try again later." }, 429) };
  return { session };
}

function targetOf(req: Request): { target: Target; crewId: string | null } | null {
  const url = new URL(req.url);
  const target = url.searchParams.get("target") as Target;
  if (!TARGETS.includes(target)) return null;
  const crewId = url.searchParams.get("crew");
  if (target !== "profile-banner" && !(crewId && /^[0-9a-f-]{36}$/i.test(crewId))) return null;
  return { target, crewId };
}

async function expire(target: Target, userId: string, slug?: string) {
  revalidateTag("crews", { expire: 0 });
  if (slug) revalidateTag(`crew:${slug}`, { expire: 0 });
  if (target === "profile-banner") {
    revalidateTag("creators", { expire: 0 });
    const p = await getProfileByUser(userId);
    if (p) revalidateTag(`creator:${p.handle}`, { expire: 0 });
  }
}

export async function POST(req: Request) {
  const t = targetOf(req);
  if (!t) return json({ error: "Unknown upload target." }, 400);
  const w = await who(req, "put");
  if ("error" in w) return w.error;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024)
    return json({ error: MESSAGES.too_large }, 413);

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return json({ error: "Send the image as a form upload." }, 400);
  }
  if (!file) return json({ error: "Pick an image first." }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: MESSAGES.too_large }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const me = w.session.user.id;

  let r:
    Awaited<ReturnType<typeof setProfileBannerImage>> | Awaited<ReturnType<typeof setCrewImage>>;
  try {
    r =
      t.target === "profile-banner"
        ? await setProfileBannerImage(me, bytes)
        : await setCrewImage(me, t.crewId!, t.target === "crew-banner" ? "banner" : "logo", bytes);
  } catch (err) {
    logger.error("upload crashed", { target: t.target, error: String(err) });
    return json({ error: MESSAGES.storage }, 500);
  }
  if (!r.ok)
    return json(
      { error: MESSAGES[r.error] ?? "That didn't work." },
      // 502: our storage failed (the image was fine); 422: the image itself was refused.
      r.error === "forbidden" ? 403 : r.error === "storage" ? 502 : 422,
    );
  await expire(t.target, me, (r as { slug?: string }).slug);
  return json({ url: r.url });
}

export async function DELETE(req: Request) {
  const t = targetOf(req);
  if (!t) return json({ error: "Unknown upload target." }, 400);
  const w = await who(req, "delete");
  if ("error" in w) return w.error;
  const actor = { id: w.session.user.id, roles: rolesOf(w.session) };
  const url = new URL(req.url);
  // Staff can take down someone else's banner: ?user=<id>.
  const userId = url.searchParams.get("user") ?? actor.id;
  const r =
    t.target === "profile-banner"
      ? await clearProfileBannerImage(actor, userId)
      : await clearCrewImage(actor, t.crewId!, t.target === "crew-banner" ? "banner" : "logo");
  if (!r.ok)
    return json(
      { error: MESSAGES[r.error] ?? "That didn't work." },
      r.error === "forbidden" ? 403 : 404,
    );
  await expire(t.target, userId, (r as { slug?: string }).slug);
  return json({ ok: true });
}
