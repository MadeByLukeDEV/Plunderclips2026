import { logger, redis } from "@plunderclips/shared";

/** What a channel's live stream carries. Dates travel as ISO strings. */
export type ChatEvent =
  { type: "message"; message: ChatMessageWire } | { type: "delete"; id: number };

export type ChatMessageWire = {
  id: number;
  channelId: string;
  authorId: string;
  handle: string;
  displayName: string;
  image: string | null;
  body: string;
  createdAt: string;
  deleted: "author" | "staff" | null;
};

type Listener = (e: ChatEvent) => void;
type Sub = ReturnType<typeof redis>;
type Bus = { sub: Sub; listeners: Map<string, Set<Listener>> };

const g = globalThis as unknown as { __chatBus?: Bus };
const topic = (channelId: string) => `chat:${channelId}`;

/**
 * One Redis subscriber connection per server process (a subscribed connection can't run other
 * commands), fanned out to every open stream in that process. Messages are published by whichever
 * process saved them, so streams on every instance see them.
 */
function bus(): Bus {
  if (!g.__chatBus) {
    const sub = redis().duplicate();
    const listeners = new Map<string, Set<Listener>>();
    sub.on("message", (ch: string, raw: string) => {
      const set = listeners.get(ch.slice("chat:".length));
      if (!set?.size) return;
      let e: ChatEvent;
      try {
        e = JSON.parse(raw) as ChatEvent;
      } catch {
        return;
      }
      for (const l of set) {
        try {
          l(e);
        } catch (err) {
          logger.warn("chat listener failed", { error: String(err) });
        }
      }
    });
    sub.on("error", (err: Error) => logger.warn("chat bus error", { error: err.message }));
    g.__chatBus = { sub, listeners };
  }
  return g.__chatBus;
}

export async function publish(channelId: string, e: ChatEvent): Promise<void> {
  try {
    await redis().publish(topic(channelId), JSON.stringify(e));
  } catch (err) {
    // The message is saved; open streams pick it up when they reconnect and catch up.
    logger.warn("chat publish failed", { error: String(err) });
  }
}

/** Listens to one channel; call the returned function to stop. */
export async function subscribe(
  channelId: string,
  listener: Listener,
): Promise<() => Promise<void>> {
  const b = bus();
  let set = b.listeners.get(channelId);
  if (!set) {
    set = new Set();
    b.listeners.set(channelId, set);
    await b.sub.subscribe(topic(channelId));
  }
  set.add(listener);
  return async () => {
    set.delete(listener);
    if (!set.size && b.listeners.get(channelId) === set) {
      b.listeners.delete(channelId);
      await b.sub.unsubscribe(topic(channelId)).catch(() => {});
    }
  };
}
