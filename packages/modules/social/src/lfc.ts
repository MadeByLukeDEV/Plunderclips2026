import { and, desc, eq, gt, or, sql } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { audit, isStaff, type Actor } from "@plunderclips/moderation";
import { standing } from "./crews";

const { lfcPost, creatorProfile, crew, user } = schema;

export const LFC_REGIONS = ["eu", "na", "sa", "oce", "asia", "any"] as const;
export const LFC_PLATFORMS = ["pc", "xbox", "playstation", "any"] as const;
export const LFC_SHIPS = ["sloop", "brigantine", "galleon", "any"] as const;
export const LFC_STYLES = [
  "pvp",
  "adventure",
  "hourglass",
  "reapers",
  "fishing",
  "tall-tales",
  "fotd",
  "chill",
  "streaming",
] as const;
export type LfcRegion = (typeof LFC_REGIONS)[number];
export type LfcPlatform = (typeof LFC_PLATFORMS)[number];
export type LfcShip = (typeof LFC_SHIPS)[number];
export type LfcStyle = (typeof LFC_STYLES)[number];

export const LFC_TITLE_MAX = 80;
export const LFC_BODY_MAX = 500;
export const LFC_AVAILABILITY_MAX = 80;
/** Posts close after two weeks; a member has three open at most. */
export const LFC_DAYS = 14;
export const LFC_ACTIVE_MAX = 3;

export type LfcPost = {
  id: string;
  title: string;
  body: string;
  region: LfcRegion;
  platform: LfcPlatform;
  ship: LfcShip;
  styles: LfcStyle[];
  availability: string;
  createdAt: Date;
  expiresAt: Date;
  author: { userId: string; handle: string; name: string; image: string | null };
  crew: { slug: string; name: string } | null;
};

export type LfcFilter = { region?: string; platform?: string; ship?: string; style?: string };

const visible = or(eq(user.banned, false), sql`${user.banned} is null`)!;
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  (list as readonly string[]).includes(v as string) ? (v as T) : fallback;

/** Open posts, newest first. Filters match "any" too (a post for any region suits everyone). */
export async function listLfcPosts(filter: LfcFilter = {}, limit = 60): Promise<LfcPost[]> {
  const where = [gt(lfcPost.expiresAt, new Date()), visible];
  const region = pick(LFC_REGIONS, filter.region, "any");
  const platform = pick(LFC_PLATFORMS, filter.platform, "any");
  const ship = pick(LFC_SHIPS, filter.ship, "any");
  if (region !== "any") where.push(sql`${lfcPost.region} in (${region}, 'any')`);
  if (platform !== "any") where.push(sql`${lfcPost.platform} in (${platform}, 'any')`);
  if (ship !== "any") where.push(sql`${lfcPost.ship} in (${ship}, 'any')`);
  if ((LFC_STYLES as readonly string[]).includes(filter.style ?? ""))
    where.push(sql`${filter.style} = any(${lfcPost.styles})`);
  const rows = await db()
    .select({
      id: lfcPost.id,
      title: lfcPost.title,
      body: lfcPost.body,
      region: lfcPost.region,
      platform: lfcPost.platform,
      ship: lfcPost.ship,
      styles: lfcPost.styles,
      availability: lfcPost.availability,
      createdAt: lfcPost.createdAt,
      expiresAt: lfcPost.expiresAt,
      userId: creatorProfile.userId,
      handle: creatorProfile.handle,
      name: creatorProfile.displayName,
      image: user.image,
      crewSlug: crew.slug,
      crewName: crew.name,
    })
    .from(lfcPost)
    .innerJoin(creatorProfile, eq(creatorProfile.userId, lfcPost.authorId))
    .innerJoin(user, eq(user.id, lfcPost.authorId))
    .leftJoin(crew, eq(crew.id, lfcPost.crewId))
    .where(and(...where))
    .orderBy(desc(lfcPost.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    region: r.region,
    platform: r.platform,
    ship: r.ship,
    styles: r.styles.filter((s): s is LfcStyle => (LFC_STYLES as readonly string[]).includes(s)),
    availability: r.availability,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    author: { userId: r.userId, handle: r.handle, name: r.name, image: r.image },
    crew: r.crewSlug && r.crewName ? { slug: r.crewSlug, name: r.crewName } : null,
  }));
}

export type LfcInput = {
  title: string;
  body?: string;
  region?: string;
  platform?: string;
  ship?: string;
  styles?: string[];
  availability?: string;
  /** Post for this crew (captain or officer only). */
  crewId?: string | null;
};

export type LfcError = "no_profile" | "invalid" | "too_many" | "forbidden" | "not_found";

/** Opens a post for two weeks. */
export async function createLfcPost(
  userId: string,
  input: LfcInput,
): Promise<{ ok: true; id: string } | { ok: false; error: LfcError }> {
  const [me] = await db()
    .select({ u: creatorProfile.userId })
    .from(creatorProfile)
    .where(eq(creatorProfile.userId, userId));
  if (!me) return { ok: false, error: "no_profile" };
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, LFC_TITLE_MAX);
  if (!title) return { ok: false, error: "invalid" };
  if (input.crewId) {
    const s = await standing(input.crewId, userId);
    if (s.kind !== "member" || s.role === "deckhand") return { ok: false, error: "forbidden" };
  }
  const [{ n }] = (await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(lfcPost)
    .where(and(eq(lfcPost.authorId, userId), gt(lfcPost.expiresAt, new Date())))) as [
    { n: number },
  ];
  if (n >= LFC_ACTIVE_MAX) return { ok: false, error: "too_many" };
  const styles = [...new Set(input.styles ?? [])]
    .filter((s) => (LFC_STYLES as readonly string[]).includes(s))
    .slice(0, 5);
  const [row] = await db()
    .insert(lfcPost)
    .values({
      authorId: userId,
      crewId: input.crewId || null,
      title,
      body: (input.body ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, LFC_BODY_MAX),
      region: pick(LFC_REGIONS, input.region, "any"),
      platform: pick(LFC_PLATFORMS, input.platform, "any"),
      ship: pick(LFC_SHIPS, input.ship, "any"),
      styles,
      availability: (input.availability ?? "").replace(/\s+/g, " ").trim().slice(0, LFC_AVAILABILITY_MAX),
      expiresAt: new Date(Date.now() + LFC_DAYS * 86_400_000),
    })
    .returning({ id: lfcPost.id });
  return { ok: true, id: row!.id };
}

/** The author closes their post; staff remove any (logged). */
export async function deleteLfcPost(
  actor: Actor,
  postId: string,
): Promise<{ ok: true } | { ok: false; error: LfcError }> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return { ok: false, error: "not_found" };
  const [post] = await db()
    .select({ authorId: lfcPost.authorId, title: lfcPost.title })
    .from(lfcPost)
    .where(eq(lfcPost.id, postId));
  if (!post) return { ok: false, error: "not_found" };
  const own = post.authorId === actor.id;
  if (!own && !isStaff(actor)) return { ok: false, error: "forbidden" };
  await db().delete(lfcPost).where(eq(lfcPost.id, postId));
  if (!own)
    await audit(actor.id, {
      action: "lfc.remove",
      targetType: "lfc",
      targetId: postId,
      meta: { title: post.title, authorId: post.authorId },
    });
  return { ok: true };
}

/** Whether this creator has an open post: it invites direct messages from anyone who reads it. */
export async function hasOpenLfcPost(userId: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: lfcPost.id })
    .from(lfcPost)
    .where(and(eq(lfcPost.authorId, userId), gt(lfcPost.expiresAt, new Date())))
    .limit(1);
  return !!row;
}

