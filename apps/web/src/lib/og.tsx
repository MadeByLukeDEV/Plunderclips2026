import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/** Artwork from public/art as a data URL (the app runs from apps/web in dev, from the repo root in Docker). */
export async function artDataUrl(file: string): Promise<string | null> {
  for (const base of [
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "apps/web/public"),
  ]) {
    try {
      const data = await readFile(path.join(base, "art", file));
      return `data:image/jpeg;base64,${data.toString("base64")}`;
    } catch {
      // try the next location
    }
  }
  return null;
}

/** A Google font, just the letters needed. null (default font) if Google Fonts is unreachable. */
async function googleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`,
        { signal: AbortSignal.timeout(3000) },
      )
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url, { signal: AbortSignal.timeout(3000) })).arrayBuffer();
  } catch {
    return null;
  }
}

/** A 1200×630 share card on the deck colours: background picture, mint eyebrow, big title. */
export async function ogCard({
  eyebrow,
  title,
  subtitle,
  image,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** A remote JPEG/PNG URL or a data URL; the card is plain deck blue without one. */
  image?: string | null;
}) {
  const heading = title.length > 70 ? `${title.slice(0, 67)}…` : title;
  const [font, body] = await Promise.all([
    googleFont("Big Shoulders", 800, `${heading}PLUNDERCLIPS`.toUpperCase()),
    googleFont("DM Sans", 500, `${eyebrow.toUpperCase()}${subtitle ?? ""}`),
  ]);
  const bodyFont = body ? "DM Sans" : undefined;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: "#10141b",
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
        <img
          src={image}
          alt=""
          width={1200}
          height={630}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          background:
            "linear-gradient(90deg, rgba(16,20,27,0.96) 0%, rgba(16,20,27,0.85) 50%, rgba(16,20,27,0.35) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 34,
            fontFamily: font ? "Big Shoulders" : undefined,
            fontWeight: 800,
            color: "#f1ece0",
            letterSpacing: 1,
          }}
        >
          PLUNDER<span style={{ color: "#3fd3a0" }}>CLIPS</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontFamily: bodyFont,
              color: "#3fd3a0",
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: heading.length > 40 ? 76 : 96,
              lineHeight: 0.95,
              fontFamily: font ? "Big Shoulders" : undefined,
              fontWeight: 800,
              color: "#f1ece0",
              textTransform: "uppercase",
            }}
          >
            {heading}
          </div>
          {subtitle ? (
            <div
              style={{
                display: "flex",
                marginTop: 20,
                fontSize: 30,
                fontFamily: bodyFont,
                color: "#d6d1c4",
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        ...(font
          ? [{ name: "Big Shoulders", data: font, weight: 800 as const, style: "normal" as const }]
          : []),
        ...(body
          ? [{ name: "DM Sans", data: body, weight: 500 as const, style: "normal" as const }]
          : []),
      ],
    },
  );
}
