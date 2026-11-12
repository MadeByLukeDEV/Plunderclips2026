import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { BANNERS, isBanner, type Banner } from "./banners";
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
  image: user.image,
  followerCount: creatorProfile.followerCount,
  createdAt: creatorProfile.createdAt,
};

/** Banned members' pages disappear (banned is null for most users). */
const visible = or(eq(user.banned, false), sql`${user.banned} is null`)!;

async function withChannels<T extends { userId: string; banner: string }>(
  rows: T[],
): Promise<(Omit<T, "banner"> & { banner: Banner; channels: Channel[] })[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.userId);
  const channels = await db()
    .select()
    .from(creatorChannel)
    .where(inArray(creatorChannel.userId, ids));
  const order = (p: string) => CHANNEL_PLATFORMS.indexOf(p as ChannelPlatform);
  return rows.map((r) => ({
    ...r,
    banner: isBanner(r.banner) ? r.banner : "ninth-wave",
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

  const banner = input.banner ?? "ninth-wave";
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

  if (on) await db().insert(creatorFollow).values({ followerId, creatorId }).onConflictDoNothing();
  else
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

export async function followerCount(creatorId: string): Promise<number> {
  const [row] = await db()
    .select({ n: creatorProfile.followerCount })
    .from(creatorProfile)
    .where(eq(creatorProfile.userId, creatorId));
  return row?.n ?? 0;
}

export { BANNERS };
