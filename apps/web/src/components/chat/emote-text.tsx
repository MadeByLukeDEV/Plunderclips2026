import type { Emote } from "@plunderclips/social";

/**
 * A message body with 7TV/BTTV codes drawn as their images, like Twitch chat: a whitespace-
 * separated word that matches a code exactly becomes the emote. Everything else stays text
 * (React escapes it). Emoji are plain characters and render as they are.
 */
export function EmoteText({ body, emotes }: { body: string; emotes: Map<string, Emote> }) {
  if (!emotes.size) return <>{body}</>;
  const parts = body.split(/(\s+)/);
  return (
    <>
      {parts.map((part, i) => {
        const e = emotes.get(part);
        return e ? (
          // eslint-disable-next-line @next/next/no-img-element -- emote CDNs, sized like text
          <img
            key={i}
            src={e.url}
            alt={e.code}
            title={`${e.code} (${e.provider === "7tv" ? "7TV" : "BTTV"})`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="mx-0.5 inline-block h-7 w-auto max-w-[112px] align-middle"
          />
        ) : (
          part
        );
      })}
    </>
  );
}
