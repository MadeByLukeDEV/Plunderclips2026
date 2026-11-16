import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { env, logger } from "@plunderclips/shared";

export type Storage = {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
};

/** Keys we create: `<folder>/<owner id>/<random>.webp`. Anything else is never read or deleted. */
const KEY = /^(banners|logos)\/(user|crew)\/[A-Za-z0-9_-]{1,64}\/[a-f0-9]{24}\.webp$/;
export const isMediaKey = (key: string) => KEY.test(key);

export function newKey(
  folder: "banners" | "logos",
  owner: "user" | "crew",
  ownerId: string,
): string {
  const id = ownerId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return `${folder}/${owner}/${id}/${randomBytes(12).toString("hex")}.webp`;
}

/** Whether uploads are switched on (MEDIA_DRIVER with its settings). */
export function mediaEnabled(): boolean {
  const e = env();
  if (e.MEDIA_DRIVER === "r2")
    return !!(
      e.R2_ACCOUNT_ID &&
      e.R2_ACCESS_KEY_ID &&
      e.R2_SECRET_ACCESS_KEY &&
      e.R2_BUCKET &&
      e.MEDIA_PUBLIC_URL
    );
  return e.MEDIA_DRIVER === "local" && e.NODE_ENV !== "production";
}

/** Public URL for a stored key, or null when the key isn't ours or uploads are off. */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key || !isMediaKey(key)) return null;
  const e = env();
  if (e.MEDIA_DRIVER === "r2" && e.MEDIA_PUBLIC_URL)
    return `${e.MEDIA_PUBLIC_URL.replace(/\/+$/, "")}/${key}`;
  if (e.MEDIA_DRIVER === "local") return `/media/${key}`;
  return null;
}

/** Cloudflare R2 through its S3 API. Objects are immutable (a new key per upload), cached for a year. */
function r2(): Storage {
  const e = env();
  const client = new AwsClient({
    accessKeyId: e.R2_ACCESS_KEY_ID!,
    secretAccessKey: e.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  const base = `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${e.R2_BUCKET}`;
  return {
    async put(key, data, contentType) {
      const res = await client.fetch(`${base}/${key}`, {
        method: "PUT",
        body: new Uint8Array(data),
        headers: {
          "content-type": contentType,
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
      if (!res.ok) throw new Error(`R2 put failed: HTTP ${res.status}`);
    },
    async remove(key) {
      const res = await client.fetch(`${base}/${key}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed: HTTP ${res.status}`);
    },
  };
}

export function localDir(): string {
  return path.resolve(env().MEDIA_LOCAL_DIR ?? path.join(process.cwd(), ".media"));
}

/** Development only: files on disk, served by the app's /media route. */
function local(): Storage {
  const root = localDir();
  const file = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error("bad media key");
    return p;
  };
  return {
    async put(key, data) {
      await mkdir(path.dirname(file(key)), { recursive: true });
      await writeFile(file(key), data);
    },
    async remove(key) {
      await rm(file(key), { force: true });
    },
  };
}

/** Reads a local file for the dev /media route. null when missing or not ours. */
export async function readLocal(key: string): Promise<Buffer | null> {
  if (env().MEDIA_DRIVER !== "local" || !isMediaKey(key)) return null;
  try {
    return await readFile(path.join(localDir(), key));
  } catch {
    return null;
  }
}

let override: Storage | null = null;
/** Tests swap in an in-memory store. */
export function setStorageForTests(s: Storage | null) {
  override = s;
}

export function storage(): Storage {
  if (override) return override;
  if (!mediaEnabled()) throw new Error("Uploads are not configured (MEDIA_DRIVER)");
  return env().MEDIA_DRIVER === "r2" ? r2() : local();
}

/** Removes an old object after a replace or removal. Failures only leave an orphan, so they're logged. */
export async function removeQuietly(key: string | null | undefined): Promise<void> {
  if (!key || !isMediaKey(key)) return;
  try {
    await storage().remove(key);
  } catch (err) {
    logger.warn("media remove failed", { key, error: String(err) });
  }
}
