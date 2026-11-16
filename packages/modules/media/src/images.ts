import sharp, { type Metadata } from "sharp";

/** What members can upload, and how each is cut. */
export const IMAGE_KINDS = {
  /** Profile and crew page banners: wide, cropped to 3:1 around the most detailed part. */
  banner: { width: 1800, height: 600, quality: 80 },
  /** Crew logos: square. */
  logo: { width: 256, height: 256, quality: 85 },
} as const;

export type ImageKind = keyof typeof IMAGE_KINDS;

/** Largest file accepted before decoding. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Decoder guard against decompression bombs (a tiny file that expands to gigapixels). */
const MAX_INPUT_PIXELS = 40_000_000;
const FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif"]);

export type ProcessError = "too_large" | "not_an_image" | "too_small";

/**
 * Re-encodes an upload as WebP at a fixed size. Only the pixels survive: EXIF (including GPS),
 * colour profiles and any embedded payloads are dropped, animated images keep their first frame,
 * and the format is read from the bytes, never from the file name or the browser's MIME type.
 */
export async function processImage(
  input: Uint8Array,
  kind: ImageKind,
): Promise<{ ok: true; data: Buffer } | { ok: false; error: ProcessError }> {
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: "too_large" };
  const spec = IMAGE_KINDS[kind];
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    return { ok: false, error: "not_an_image" };
  }
  if (!meta.format || !FORMATS.has(meta.format)) return { ok: false, error: "not_an_image" };
  const minSide = kind === "logo" ? 64 : 400;
  if ((meta.width ?? 0) < minSide || (meta.height ?? 0) < minSide / (kind === "logo" ? 1 : 4))
    return { ok: false, error: "too_small" };
  try {
    const data = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .rotate()
      .resize(spec.width, spec.height, { fit: "cover", position: "attention" })
      .webp({ quality: spec.quality, effort: 4 })
      .toBuffer();
    return { ok: true, data };
  } catch {
    return { ok: false, error: "not_an_image" };
  }
}
