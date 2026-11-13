import { Suspense } from "react";
import Link from "next/link";
import { canBan, canSetRoles, listUsers } from "@plunderclips/moderation";
import { Button } from "@plunderclips/ui/components/button";
import { Input } from "@plunderclips/ui/components/input";
import { cn } from "@plunderclips/ui/lib/utils";
import { MemberRow } from "@/components/admin/member-row";
import { requireStaff } from "@/lib/staff";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTERS = [
  ["all", "Everyone"],
  ["staff", "Mods and admins"],
  ["banned", "Banned"],
] as const;

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

export default function UsersPage({ searchParams }: Props) {
  return (
    <div>
      <h1 className="text-h2">Members</h1>
      <p className="text-muted-foreground mt-3 max-w-[60ch]">
        Ban members who break the rules. Admins can also hand out the creator, mod and admin roles.
      </p>
      <Suspense fallback={<div className="bg-card mt-8 h-72 animate-pulse rounded-2xl" />}>
        <Members searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Members({ searchParams }: Props) {
  const { actor } = await requireStaff("/admin/users");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const filter = FILTERS.find(([f]) => f === sp.filter)?.[0] ?? "all";
  const offset = Math.max(Number(sp.offset ?? 0) || 0, 0);
  const { users, hasMore } = await listUsers(actor, { q, filter, offset });
  const href = (o: Record<string, string | number>) =>
    `/admin/users?${new URLSearchParams(
      Object.entries({ q, filter, ...o })
        .filter(([, v]) => !["", "all", "0"].includes(String(v)))
        .map(([k, v]) => [k, String(v)]),
    )}`;

  return (
    <>
      <form action="/admin/users" className="mt-8 flex max-w-xl gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Name or handle…"
          aria-label="Search members"
        />
        {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <nav aria-label="Filter" className="mt-4 flex flex-wrap gap-1">
        {FILTERS.map(([f, label]) => (
          <Link
            key={f}
            href={href({ filter: f, offset: 0 })}
            aria-current={f === filter ? "true" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-lg px-4 text-sm transition-colors",
              f === filter
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {users.length ? (
        <ul className="divide-border border-border bg-card mt-6 divide-y rounded-2xl border">
          {users.map((u) => (
            <MemberRow
              key={u.id}
              m={{
                ...u,
                // Mods moderate by name and handle; only admins see full email addresses.
                email: canSetRoles(actor) ? u.email : maskEmail(u.email),
                createdAt: u.createdAt.toISOString(),
                banExpires: u.banExpires ? u.banExpires.toISOString() : null,
              }}
              isMe={u.id === actor.id}
              canBan={canBan(actor)}
              canSetRoles={canSetRoles(actor)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-6">
          {q ? `No one matches "${q}".` : "No members here."}
        </p>
      )}

      {offset > 0 || hasMore ? (
        <div className="mt-6 flex gap-3">
          {offset > 0 ? (
            <Button asChild variant="secondary">
              <Link href={href({ offset: Math.max(offset - 30, 0) })}>Previous</Link>
            </Button>
          ) : null}
          {hasMore ? (
            <Button asChild variant="secondary">
              <Link href={href({ offset: offset + 30 })}>Next</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
