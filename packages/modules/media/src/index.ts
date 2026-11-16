/**
 * @plunderclips/media — Uploaded images: processing (sharp → WebP) and storage (Cloudflare R2,
 * or local files in development). Owners and permissions live in the modules that use it.
 *
 * Public API of this module. Other modules and the web app may import ONLY
 * from "@plunderclips/media"; deep imports into src/ are blocked by ESLint.
 */
export const MODULE_NAME = "media" as const;

export {
  processImage,
  IMAGE_KINDS,
  MAX_UPLOAD_BYTES,
  type ImageKind,
  type ProcessError,
} from "./images";
export {
  storage,
  mediaEnabled,
  mediaUrl,
  newKey,
  isMediaKey,
  readLocal,
  removeQuietly,
  setStorageForTests,
  type Storage,
} from "./storage";
