import { siteUrl, SITE_DESCRIPTION } from "@/lib/seo";

/**
 * llms.txt (llmstxt.org): a plain-language map of the site for AI assistants and answer engines,
 * so they describe Plunderclips correctly and link to the right pages.
 */
export function GET() {
  const body = `# Plunderclips

> ${SITE_DESCRIPTION}

Plunderclips is an unofficial fan community for Sea of Thieves, the pirate game by Rare. Anyone can submit a public clip link from Twitch, YouTube, Kick, TikTok, Medal or X without an account; moderators review every clip before it goes live. Streamers get a creator page with their channels and clips, can form crews with other creators, chat, plan sessions, and find crewmates.

Not affiliated with or endorsed by Rare Ltd. or Microsoft.

## Clips

- [All clips](${siteUrl("/clips")}): every approved clip, newest or most-voted first, filterable by tag (PvP, sailing, kraken, megalodon, forts, heists and more).
- [This week](${siteUrl("/clips/weekly")}): the week's top clips.
- [Best of](${siteUrl("/clips/best-of")}): all-time favourites.
- [Featured](${siteUrl("/clips/featured")}): picked by the mods, with the streamer's channel beside the clip.
- [Submit a clip](${siteUrl("/submit")}): paste a public clip link; no sign-up needed. Only Sea of Thieves content is accepted, and the original clip must be linked (no re-uploads).

## Creators and crews

- [Creators](${siteUrl("/creators")}): Sea of Thieves streamers with their Twitch, YouTube, Kick and other channels and their clips. Each creator page lives at /c/<handle>.
- [Crews](${siteUrl("/crews")}): groups of creators who sail together, with a captain, officers and deckhands. Each crew page lives at /crews/<slug> and shows its members and upcoming public sessions.
- [Find a crew](${siteUrl("/looking-for-crew")}): posts from players looking for a crew and crews recruiting, filterable by region, platform, ship size and playstyle.

## How it works

1. Paste a public clip or video link. A title is enough.
2. A moderator reviews it; trusted creators skip the wait.
3. Approved clips go live and can be voted into This week, and from there into Best of.
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
