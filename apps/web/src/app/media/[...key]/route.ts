import { connection } from "next/server";
import { readLocal } from "@plunderclips/media";

/** Development only (MEDIA_DRIVER=local): serves uploaded files from disk. R2 serves them in production. */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  await connection();
  const { key } = await ctx.params;
  const data = await readLocal(key.join("/"));
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
