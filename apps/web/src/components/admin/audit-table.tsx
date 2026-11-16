import Link from "next/link";
import type { AuditRow } from "@plunderclips/moderation";
import { LocalTime } from "@/components/local-time";

const verbs: Record<string, string> = {
  "clip.approve": "published a clip",
  "clip.reject": "rejected a clip",
  "clip.update": "re-curated a clip",
  "clip.unpublish": "took down a clip",
  "section.arrange": "rearranged a section",
  "report.dismiss": "dismissed reports",
  "report.take_down": "took down a reported clip",
  "user.ban": "banned a member",
  "user.unban": "unbanned a member",
  "user.role": "changed roles",
  "crew.disband": "disbanded a crew",
  "message.remove": "removed a chat message",
  "report.resolve": "closed reports",
};

function target(r: AuditRow): { label: string; href: string | null } {
  if (r.targetType === "clip") return { label: "clip", href: `/clip/${r.targetId}` };
  if (r.targetType === "section")
    return { label: r.targetId, href: `/admin/sections?s=${r.targetId}` };
  if (r.targetType === "user") return { label: "member", href: null };
  if (r.targetType === "creator") return { label: "creator page", href: null };
  if (r.targetType === "message") return { label: "chat message", href: null };
  if (r.targetType === "crew")
    return { label: String((r.meta as { name?: unknown }).name ?? "crew"), href: null };
  return { label: r.targetType, href: null };
}

function detail(r: AuditRow): string | null {
  const m = r.meta as Record<string, unknown>;
  if (typeof m.reason === "string") return m.reason;
  if (Array.isArray(m.to)) return m.to.join(", ");
  if (Array.isArray(m.sections) && m.sections.length) return `picked for ${m.sections.join(", ")}`;
  if (typeof m.closed === "number") return `${m.closed} closed`;
  return null;
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (!rows.length)
    return (
      <p className="text-muted-foreground">
        Nothing logged yet. Every moderation action shows up here.
      </p>
    );
  return (
    <div className="border-border overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-muted-foreground bg-card font-mono text-xs tracking-wide uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-normal">
              When
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Who
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              What
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Details
            </th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((r) => {
            const t = target(r);
            return (
              <tr key={r.id}>
                <td className="text-muted-foreground px-4 py-3 font-mono text-xs whitespace-nowrap">
                  <LocalTime value={r.createdAt} format="datetime" />
                </td>
                <td className="px-4 py-3">{r.actorName ?? "deleted account"}</td>
                <td className="px-4 py-3">
                  {verbs[r.action] ?? r.action}
                  {t.href ? (
                    <>
                      {" "}
                      <Link
                        href={t.href}
                        className="link-draw text-muted-foreground font-mono text-xs"
                      >
                        {t.label}
                      </Link>
                    </>
                  ) : null}
                </td>
                <td className="text-muted-foreground px-4 py-3">{detail(r) ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
