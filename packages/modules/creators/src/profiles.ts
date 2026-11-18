import { and, asc, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { logger } from "@plunderclips/shared";
import {
  mediaUrl,
  newKey,
  processImage,
  removeQuietly,
  storage,
  type ProcessError,
} from "@plunderclips/media";
import { audit, isStaff, type Actor } from "@plunderclips/moderation";
import { notify } from "@plunderclips/notifications";
import { BANNERS, DEFAULT_BANNER, isBanner, type Banner } from "./banners";
import { CHANNEL_PLATFORMS, parseChannel, type Channel, type ChannelPlatform } from "./channels";
import { checkHandle, type HandleError } from "./handle";

const { creatorProfile, creatorChannel, creatorFollow, user } = schema;

export const DISPLAY_NAME_MAX = 40;
export const BIO_MAX = 300;

export type Profile = {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  banner: Banner;
  /** Uploaded banner; shown instead of `banner` when set. */
  bannerUrl: string | null;
  /** Avatar from the sign-in platform. */
  image: string | null;
  followerCount: number;
  channels: Channel[];
  createdAt: Date;
};

const profileColumns = {
  userId: creatorProfile.userId,
  handle: creatorProfile.handle,
  displayName: creatorProfile.displayName,
  bio: creatorProfile.bio,
  banner: creatorProfile.banner,
  bannerImage: creatorProfile.bannerImage,
  image: user.image,
  followerCount: creatorProfile.followerCount,
  createdAt: creatorProfile.createdAt,
};

/** Banned members' pages disappear (banned is null for most users). */
const visible = or(eq(user.banned, false), sql`${user.banned} is null`)!;

type ProfileRow = Omit<Profile, "banner" | "bannerUrl" | "channels"> & {
  banner: string;
  bannerImage: string | null;
};

async function withChannels(rows: ProfileRow[]): Promise<Profile[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.userId);
  const channels = await db()
    .select()
    .from(creatorChannel)
    .where(inArray(creatorChannel.userId, ids));
  const order = (p: string) => CHANNEL_PLATFORMS.indexOf(p as ChannelPlatform);
  return rows.map(({ bannerImage, ...r }) => ({
    ...r,
    bannerUrl: mediaUrl(bannerImage),
    banner: isBanner(r.banner) ? r.banner : DEFAULT_BANNER,
    channels: channels
      .filter(
        (c) =>
          c.userId === r.userId && (CHANNEL_PLATFORMS as readonly string[]).includes(c.platform),
      )
      .map((c) => ({ platform: c.platform as ChannelPlatform, handle: c.handle }))
      .sort((a, b) => order(a.platform) - order(b.platform)),
  }));
}

export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const h = handle.toLowerCase();
  if (!/^[a-z0-9_-]{1,24}$/.test(h)) return null;
  const rows = await db()
    .select(profileColumns)
    .from(creatorProfile)
    .innerJoin(user, eq(user.id, creatorProfile.userId))
    .where(and(eq(creatorProfile.handle, h), visible))
    .limit(1);
  return (await withChannels(rows))[0] ?? null;
}

/** The signed-in member's own profile (shown even if they're banned, so they can see it). */
export async function getProfileByUser(userId: string): Promise<Profile | null> {
  const rows = await db()
    .select(profileColumns)
    .from(creatorProfile)
    .innerJoin(user, eq(user.id, creatorProfile.userId))
    .where(eq(creatorProfile.userId, userId))
    .limit(1);
  return (await withChannels(rows))[0] ?? null;
}

export type ProfileSort = "new" | "followers";

export async function listProfiles(
  opts: { sort?: ProfileSort; limit?: number; offset?: number } = {},
): Promise<Profile[]> {
  const limit = Math.min(Math.max(opts.limit ?? 48, 1), 100);
  const rows = await db()
    .select(profileColumns)
    .from(creatorProfile)
    .innerJoin(user, eq(user.id, creatorProfile.userId))
    .where(visible)
    .orderBy(
      ...(opts.sort === "followers"
        ? [desc(creatorProfile.followerCount), asc(creatorProfile.handle)]
        : [desc(creatorProfile.createdAt), asc(creatorProfile.handle)]),
    )
    .limit(limit)
    .offset(Math.max(opts.offset ?? 0, 0));
  return withChannels(rows);
}

// --- Saving -------------------------------------------------------------------

export type ProfileInput = {
  handle: string;
  displayName: string;
  bio?: string;
  banner?: string;
  /** Raw input per platform: a handle or a channel URL. Empty removes the channel. */
  channels?: Partial<Record<ChannelPlatform, string>>;
};

export type ProfileFieldError =
  | { field: "handle"; error: HandleError | "taken" }
  | { field: "displayName"; error: "required" | "too_long" }
  | { field: "bio"; error: "too_long" }
  | { field: "banner"; error: "invalid" }
  | { field: `channel.${ChannelPlatform}`; error: "invalid" };

export type SaveResult =
  | { ok: true; profile: Profile; previousHandle: string | null }
  | { ok: false; errors: ProfileFieldError[] };

/** Creates or updates the member's profile and replaces their channel list, in one transaction. */
export async function saveProfile(userId: string, input: ProfileInput): Promise<SaveResult> {
  const errors: ProfileFieldError[] = [];

  const handle = checkHandle(input.handle);
  if (!handle.ok) errors.push({ field: "handle", error: handle.error });

  const displayName = input.displayName.replace(/\s+/g, " ").trim();
  if (!displayName) errors.push({ field: "displayName", error: "required" });
  else if (displayName.length > DISPLAY_NAME_MAX)
    errors.push({ field: "displayName", error: "too_long" });

  const bio = (input.bio ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (bio.length > BIO_MAX) errors.push({ field: "bio", error: "too_long" });

  const banner = input.banner ?? DEFAULT_BANNER;
  if (!isBanner(banner)) errors.push({ field: "banner", error: "invalid" });

  const channels: Channel[] = [];
  for (const platform of CHANNEL_PLATFORMS) {
    const raw = input.channels?.[platform]?.trim();
    if (!raw) continue;
    const parsed = parseChannel(platform, raw);
    if (parsed) channels.push({ platform, handle: parsed });
    else errors.push({ field: `channel.${platform}`, error: "invalid" });
  }

  if (!handle.ok || errors.length) return { ok: false, errors };

  const taken = await db()
    .select({ userId: creatorProfile.userId })
    .from(creatorProfile)
    .where(and(eq(creatorProfile.handle, handle.handle), ne(creatorProfile.userId, userId)))
    .limit(1);
  if (taken.length) return { ok: false, errors: [{ field: "handle", error: "taken" }] };

  let previousHandle: string | null = null;
  try {
    await db().transaction(async (tx) => {
      const [before] = await tx
        .select({ handle: creatorProfile.handle })
        .from(creatorProfile)
        .where(eq(creatorProfile.userId, userId))
        .limit(1);
      previousHandle = before && before.handle !== handle.handle ? before.handle : null;

      await tx
        .insert(creatorProfile)
        .values({ userId, handle: handle.handle, displayName, bio, banner: banner as Banner })
        .onConflictDoUpdate({
          target: creatorProfile.userId,
          set: { handle: handle.handle, displayName, bio, banner: banner as Banner },
        });
      await tx.delete(creatorChannel).where(eq(creatorChannel.userId, userId));
      if (channels.length)
        await tx.insert(creatorChannel).values(channels.map((c) => ({ userId, ...c })));
    });
  } catch (err) {
    // Two people grabbing the same handle at once: the unique index decides.
    const e = err as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505")
      return { ok: false, errors: [{ field: "handle", error: "taken" }] };
    throw err;
  }

  const profile = await getProfileByUser(userId);
  return { ok: true, profile: profile!, previousHandle };
}

// --- Following -----------------------------------------------------------------

export type FollowResult =
  { ok: true; following: boolean; followers: number } | { ok: false; error: "not_found" | "self" };

/** Follow or unfollow a creator. The follower count is kept by a database trigger. */
export async function setFollow(
  followerId: string,
  creatorId: string,
  on: boolean,
): Promise<FollowResult> {
  if (followerId === creatorId) return { ok: false, error: "self" };
  const [exists] = await db()
    .select({ userId: creatorProfile.userId })
    .from(creatorProfile)
    .where(eq(creatorProfile.userId, creatorId))
    .limit(1);
  if (!exists) return { ok: false, error: "not_found" };

  if (on) {
    const added = await db()
      .insert(creatorFollow)
      .values({ followerId, creatorId })
      .onConflictDoNothing()
      .returning({ c: creatorFollow.creatorId });
    if (added.length) {
      const [who] = await db()
        .select({
          name: user.name,
          display: creatorProfile.displayName,
          handle: creatorProfile.handle,
        })
        .from(user)
        .leftJoin(creatorProfile, eq(creatorProfile.userId, user.id))
        .where(eq(user.id, followerId));
      await notify([
        {
          userId: creatorId,
          kind: "new_follower",
          actorId: followerId,
          data: { handle: who?.handle ?? "", name: who?.display ?? who?.name ?? "Someone" },
          dedupeKey: `follow:${followerId}`,
        },
      ]);
    }
  } else
    await db()
      .delete(creatorFollow)
      .where(and(eq(creatorFollow.followerId, followerId), eq(creatorFollow.creatorId, creatorId)));

  const [row] = await db()
    .select({ followers: creatorProfile.followerCount })
    .from(creatorProfile)
    .where(eq(creatorProfile.userId, creatorId));
  return { ok: true, following: on, followers: row?.followers ?? 0 };
}

export async function isFollowing(followerId: string | null, creatorId: string): Promise<boolean> {
  if (!followerId) return false;
  const [row] = await db()
    .select({ c: creatorFollow.creatorId })
    .from(creatorFollow)
    .where(and(eq(creatorFollow.followerId, followerId), eq(creatorFollow.creatorId, creatorId)))
    .limit(1);
  return !!row;
}

/** Creators the member follows, most recently followed first. */
export async function listFollowing(followerId: string, limit = 24): Promise<Profile[]> {
  const rows = await db()
    .select(profileColumns)
    .from(creatorFollow)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, creatorFollow.creatorId))
    .innerJoin(user, eq(user.id, creatorProfile.userId))
    .where(and(eq(creatorFollow.followerId, followerId), visible))
    .orderBy(desc(creatorFollow.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return withChannels(rows);
}

export async function followerCount(creatorId: string): Promise<number> {
  const [row] = await db()
    .select({ n: creatorProfile.followerCount })
    .from(creatorProfile)
    .where(eq(creatorProfile.userId, creatorId));
  return row?.n ?? 0;
}

export { BANNERS };

// --- Uploaded banner -------------------------------------------------------------------

export type BannerUploadResult =
  { ok: true; url: string } | { ok: false; error: ProcessError | "no_profile" | "storage" };

/** Replaces the member's uploaded banner. The old file is removed once the new one is saved. */
export async function setProfileBannerImage(
  userId: string,
  bytes: Uint8Array,
): Promise<BannerUploadResult> {
  const [row] = await db()
    .select({ old: creatorProfile.bannerImage })
    .from(creatorProfile)
    .where(eq(creatorProfile.userId, userId));
  if (!row) return { ok: false, error: "no_profile" };
  const image = await processImage(bytes, "banner");
  if (!image.ok) return image;
  const key = newKey("banners", "user", userId);
  try {
    await storage().put(key, image.data, "image/webp");
  } catch (err) {
    logger.warn("profile banner upload failed", { key, error: String(err) });
    return { ok: false, error: "storage" };
  }
  await db()
    .update(creatorProfile)
    .set({ bannerImage: key })
    .where(eq(creatorProfile.userId, userId));
  await removeQuietly(row.old);
  return { ok: true, url: mediaUrl(key)! };
}

/** The member removes their uploaded banner, or staff take it down (logged). */
export async function clearProfileBannerImage(
  actor: Actor,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "not_found" }> {
  const own = actor.id === userId;
  if (!own && !isStaff(actor)) return { ok: false, error: "forbidden" };
  const [row] = await db()
    .select({ old: creatorProfile.bannerImage })
    .from(creatorProfile)
    .where(eq(creatorProfile.userId, userId));
  if (!row?.old) return { ok: false, error: "not_found" };
  await db()
    .update(creatorProfile)
    .set({ bannerImage: null })
    .where(eq(creatorProfile.userId, userId));
  if (!own)
    await audit(actor.id, {
      action: "image.remove",
      targetType: "creator",
      targetId: userId,
      meta: { what: "banner" },
    });
  await removeQuietly(row.old);
  return { ok: true };
}

/** Creator pages for the sitemap (banned members' pages are hidden, so left out). */
export async function listProfilesForSitemap(): Promise<{ handle: string; updatedAt: Date }[]> {
  return db()
    .select({ handle: creatorProfile.handle, updatedAt: creatorProfile.updatedAt })
    .from(creatorProfile)
    .innerJoin(user, eq(user.id, creatorProfile.userId))
    .where(visible)
    .orderBy(desc(creatorProfile.updatedAt))
    .limit(45_000);
}

/**
 * New followers per day (UTC) over the last `days`, oldest first. Counts people who still follow
 * (an unfollow removes the row), so it's growth that stuck.
 */
export async function followerGrowth(
  creatorId: string,
  days = 30,
  now = new Date(),
): Promise<{ day: string; follows: number }[]> {
  const span = Math.min(Math.max(days, 7), 90);
  const since = new Date(now.getTime() - (span - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await db()
    .select({
      day: sql<string>`to_char(${creatorFollow.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(creatorFollow)
    .where(and(eq(creatorFollow.creatorId, creatorId), gte(creatorFollow.createdAt, since)))
    .groupBy(sql`1`);
  const by = new Map(rows.map((r) => [r.day, r.n]));
  return Array.from({ length: span }, (_, i) => {
    const day = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { day, follows: by.get(day) ?? 0 };
  });
}
