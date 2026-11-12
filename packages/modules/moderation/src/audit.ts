import { and, desc, eq, lt, or } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";

const { auditLog, user } = schema;

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

export type AuditEntry = {
  action: string;
  targetType: string;
  targetId: string;
  meta?: Record<string, unknown>;
};

/** Appends to the audit log, inside the caller's transaction when given one. */
export async function audit(actorId: string | null, entry: AuditEntry, tx?: Tx): Promise<void> {
  await (tx ?? db()).insert(auditLog).values({
    actorUserId: actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    meta: entry.meta ?? {},
  });
}

export type AuditRow = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  meta: Record<string, unknown>;
  createdAt: Date;
  actorName: string | null;
};

const PAGE = 50;

export async function listAudit(
  opts: { cursor?: string | null; action?: string | null } = {},
): Promise<{ rows: AuditRow[]; nextCursor: string | null }> {
  const where = [];
  if (opts.action && /^[a-z.]{1,40}$/.test(opts.action))
    where.push(eq(auditLog.action, opts.action));
  const c = decode(opts.cursor);
  if (c)
    where.push(
      or(lt(auditLog.createdAt, c.at), and(eq(auditLog.createdAt, c.at), lt(auditLog.id, c.id)))!,
    );
  const rows = await db()
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      meta: auditLog.meta,
      createdAt: auditLog.createdAt,
      actorName: user.name,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorUserId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  return {
    rows: page,
    nextCursor:
      rows.length > PAGE && last
        ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString("base64url")
        : null,
  };
}

function decode(v: string | null | undefined): { at: Date; id: string } | null {
  if (!v || v.length > 200) return null;
  const [iso, id] = Buffer.from(v, "base64url").toString("utf8").split("|");
  const at = iso ? new Date(iso) : null;
  return at && !Number.isNaN(at.getTime()) && id && /^[0-9a-f-]{36}$/i.test(id) ? { at, id } : null;
}

export type { Tx };
