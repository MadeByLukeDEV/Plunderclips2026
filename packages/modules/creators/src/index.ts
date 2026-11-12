/**
 * @plunderclips/creators — Creator profiles (/c/<handle>), their channels, and follows.
 *
 * Public API of this module. Other modules and the web app may import ONLY
 * from "@plunderclips/creators"; deep imports into src/ are blocked by ESLint.
 */
export const MODULE_NAME = "creators" as const;

export { checkHandle, suggestHandle, type HandleError } from "./handle";
export {
  CHANNEL_PLATFORMS,
  parseChannel,
  channelUrl,
  authorUrls,
  type Channel,
  type ChannelPlatform,
} from "./channels";
export { BANNERS, isBanner, type Banner } from "./banners";
export {
  getProfileByHandle,
  getProfileByUser,
  listProfiles,
  saveProfile,
  setFollow,
  isFollowing,
  listFollowing,
  followerCount,
  DISPLAY_NAME_MAX,
  BIO_MAX,
  type Profile,
  type ProfileSort,
  type ProfileInput,
  type ProfileFieldError,
  type SaveResult,
  type FollowResult,
} from "./profiles";
