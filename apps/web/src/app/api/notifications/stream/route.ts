import { connection } from "next/server";
import { getSession } from "@plunderclips/identity";
import { subscribeNotifications, unreadCount } from "@plunderclips/notifications";
import { slidingWindow } from "@plunderclips/shared";

const HEARTBEAT_MS = 25_000;

/**
 * Server-sent events with the member's unread count: once on connect, then whenever a
 * notification arrives or gets read (in any tab). The bell in the header listens to it.
 */
export async function GET(req: Request) {
  await connection();
  const session = await getSession(req.headers);
  if (!session) return new Response("Sign in first.", { status: 401 });
  const userId = session.user.id;
  const limited = await slidingWindow(`notify:stream:${userId}`, 60, 60);
  if (!limited.ok) return new Response("Too many reconnects.", { status: 429 });

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
      let pending: Promise<void> | null = null;
      const push = () => {
        // Collapse bursts (mark-all-read, several notifications at once) into one count.
        pending ??= new Promise<void>((r) => setTimeout(r, 150)).then(async () => {
          pending = null;
          write(`event: count\ndata: ${JSON.stringify({ unread: await unreadCount(userId) })}\n\n`);
        });
      };

      const stop = await subscribeNotifications(userId, push);
      const beat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      async function close() {
        if (closed) return;
        closed = true;
        clearInterval(beat);
        await stop();
        try {
          controller.close();
        } catch {
          // closed by the client
        }
      }
      cleanup = close;
      req.signal.addEventListener("abort", () => void close());
      write("retry: 5000\n\n");
      push();
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
