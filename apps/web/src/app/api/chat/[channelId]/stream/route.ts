import { connection } from "next/server";
import { getSession } from "@plunderclips/identity";
import { slidingWindow } from "@plunderclips/shared";
import {
  channelFor,
  listMessages,
  stillInChannel,
  subscribe,
  toWire,
  type ChatEvent,
} from "@plunderclips/social";

/** Keeps idle streams open through Cloudflare (100 s) and Traefik, and re-checks access. */
const HEARTBEAT_MS = 25_000;

/**
 * Server-sent events for one channel. On connect it sends anything after Last-Event-ID (or
 * ?after=), then every new message and removal as they're published on Redis. The stream closes
 * when the member leaves the channel; the browser reconnects on its own after network drops.
 */
export async function GET(req: Request, ctx: { params: Promise<{ channelId: string }> }) {
  await connection();
  const { channelId } = await ctx.params;
  const session = await getSession(req.headers);
  if (!session) return new Response("Sign in first.", { status: 401 });
  const userId = session.user.id;
  if (!(await channelFor(channelId, userId))) return new Response("Not found.", { status: 404 });
  const limited = await slidingWindow(`chat:stream:${userId}`, 60, 60);
  if (!limited.ok) return new Response("Too many reconnects.", { status: 429 });

  const url = new URL(req.url);
  const resume = Number(req.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0);
  const after = Number.isSafeInteger(resume) && resume > 0 ? resume : 0;

  const encoder = new TextEncoder();
  let cleanup: (() => Promise<void>) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          void close();
        }
      };
      const send = (e: ChatEvent) =>
        write(
          `${e.type === "message" ? `id: ${e.message.id}\n` : ""}event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`,
        );

      // Subscribe before catching up, so nothing published in between is lost (the browser
      // drops duplicates by id).
      const stop = await subscribe(channelId, send);
      const beat = setInterval(async () => {
        if (!(await stillInChannel(channelId, userId).catch(() => true))) {
          write("event: gone\ndata: {}\n\n");
          return void close();
        }
        write(": ping\n\n");
      }, HEARTBEAT_MS);

      async function close() {
        if (closed) return;
        closed = true;
        clearInterval(beat);
        await stop();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
      cleanup = close;
      req.signal.addEventListener("abort", () => void close());

      write("retry: 3000\n\n");
      if (after) {
        const missed = await listMessages(channelId, { after, limit: 100 });
        for (const m of missed.messages) send({ type: "message", message: toWire(m) });
      }
    },
    async cancel() {
      await cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
