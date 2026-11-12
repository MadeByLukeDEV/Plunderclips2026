/**
 * @plunderclips/clips — Clip submission, URL parsing/embeds, sections, votes and views.
 *
 * Public API of this module. Other modules and the web app may import ONLY
 * from "@plunderclips/clips"; deep imports into src/ are blocked by ESLint.
 */
export const MODULE_NAME = "clips" as const;

export {
  parseClipUrl,
  parseTimestamp,
  PLATFORMS,
  type Platform,
  type ClipKind,
  type ParsedClip,
  type ParseError,
  type ParseResult,
} from "./parse";
export { resolveClipUrl } from "./resolve";
export { embedUrl, isAllowedEmbed, EMBED_HOSTS, type EmbedOptions } from "./embed";
export {
  fetchClipMetadata,
  TWITCH_SEA_OF_THIEVES,
  type ClipMetadata,
  type MetadataOptions,
} from "./metadata";
export { twitchAppAuth, type TwitchAuth } from "./twitch-token";
