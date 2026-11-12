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
export {
  submitClip,
  LIMITS,
  TITLE_MAX,
  NOTE_MAX,
  type Submitter,
  type SubmitInput,
  type SubmitResult,
  type SubmitError,
  type SubmittedClip,
  type ClipStatus,
} from "./submit";
export {
  listClips,
  listClipsByChannels,
  listSections,
  getSectionPage,
  getClip,
  getClipCounts,
  relatedClips,
  sectionsOf,
  addToSection,
  removeFromSection,
  encodeCursor,
  decodeCursor,
  PAGE_SIZE,
  type ClipView,
  type ClipPage,
  type SectionView,
  type SectionPage,
  type ClipSort,
  type Cursor,
} from "./queries";
export { CLIP_TAGS, isClipTag, type ClipTag } from "./tags";
export { isoWeek, weekStart, previousWeek } from "./week";
export { setVote, hasVoted, voterKey, VOTE_LIMIT, type Voter, type VoteResult } from "./votes";
export { recordView, flushViews, pendingViews, VIEW_LIMIT, type ViewResult } from "./views";
