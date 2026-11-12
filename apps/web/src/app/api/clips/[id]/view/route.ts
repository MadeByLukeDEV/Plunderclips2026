import { after } from "next/server";
import { flushViews, recordView, voterKey } from "@plunderclips/clips";
import { logger } from "@plunderclips/shared";
import { currentVoter } from "@/lib/voter";

/**
 * View beacon, sent when a visitor presses play or opens the clip on its platform.
 * Same-origin only; one view per visitor per clip per six hours (see the clips module).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new Response(null, { status: 403 });

  const { id } = await ctx.params;
  const voter = await currentVoter(req.headers);
  if (!voter) return new Response(null, { status: 204 });

  const result = await recordView(id, voterKey(voter)).catch((err: unknown) => {
    logger.warn("view not recorded", { error: err instanceof Error ? err.message : String(err) });
    return "error" as const;
  });
  if (result === "counted") after(() => flushViews().catch(() => 0));
  return new Response(null, { status: result === "rate_limited" ? 429 : 204 });
}
