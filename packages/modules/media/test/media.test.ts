import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processImage } from "../src/images";
import { isMediaKey, newKey } from "../src/storage";

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#3fd3a0" } })
    .png()
    .toBuffer();

describe("processImage", () => {
  it("cuts banners to 1800x600 WebP and logos to 256x256", async () => {
    const banner = await processImage(await png(2400, 1000), "banner");
    if (!banner.ok) throw new Error(banner.error);
    expect(await sharp(banner.data).metadata()).toMatchObject({
      format: "webp",
      width: 1800,
      height: 600,
    });
    const logo = await processImage(await png(500, 300), "logo");
    if (!logo.ok) throw new Error(logo.error);
    expect(await sharp(logo.data).metadata()).toMatchObject({
      format: "webp",
      width: 256,
      height: 256,
    });
  });

  it("drops EXIF, including location", async () => {
    const withExif = await sharp(await png(800, 400))
      .withExif({ IFD0: { Copyright: "secret" }, IFD3: { GPSLatitudeRef: "N" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy();
    const out = await processImage(withExif, "banner");
    if (!out.ok) throw new Error(out.error);
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
  });

  it("refuses non-images, tiny images and oversized files", async () => {
    expect(await processImage(Buffer.from("<svg onload=alert(1)>"), "banner")).toEqual({
      ok: false,
      error: "not_an_image",
    });
    expect(await processImage(await png(120, 40), "banner")).toEqual({
      ok: false,
      error: "too_small",
    });
    expect(await processImage(new Uint8Array(8 * 1024 * 1024 + 1), "logo")).toEqual({
      ok: false,
      error: "too_large",
    });
  });
});

describe("media keys", () => {
  it("only accepts keys we create", () => {
    const k = newKey("banners", "crew", "3f1c-uuid-like");
    expect(isMediaKey(k)).toBe(true);
    expect(newKey("logos", "user", "../../etc")).toMatch(/^logos\/user\/etc\/[a-f0-9]{24}\.webp$/);
    expect(isMediaKey("banners/user/../../x.webp")).toBe(false);
    expect(isMediaKey("https://evil.example/x.webp")).toBe(false);
  });
});
