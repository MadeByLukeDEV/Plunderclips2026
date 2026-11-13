"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@plunderclips/ui/components/button";
import { banAction, rolesAction, unbanAction } from "@/app/admin/actions";
import { formatDate } from "@/components/clips/clip-meta";
import { Avatar } from "@/components/creators/avatar";
import { ActionMessage, useAdminAction } from "./use-action";

export type MemberView = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  roles: string[];
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  handle: string | null;
  clips: number;
  createdAt: string;
};

const ROLE_LABEL: Record<string, string> = { creator: "Creator", mod: "Mod", admin: "Admin" };
const field =
  "border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-11 rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]";

export function MemberRow({
  m,
  isMe,
  canBan,
  canSetRoles,
}: {
  m: MemberView;
  isMe: boolean;
  canBan: boolean;
  canSetRoles: boolean;
}) {
  const { pending, result, run } = useAdminAction();
  const [panel, setPanel] = useState<"none" | "ban" | "roles">("none");
  const staff = m.roles.includes("mod") || m.roles.includes("admin");
  const mayBan = canBan && !isMe && !m.roles.includes("admin") && (!staff || canSetRoles);

  return (
    <li className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={m.name} image={m.image} className="size-10 text-[40px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {m.name}
            {isMe ? <span className="text-muted-foreground font-normal"> (you)</span> : null}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            {m.email}
            {m.handle ? (
              <>
                {" · "}
                <Link href={`/c/${m.handle}`} className="link-draw" target="_blank">
                  /c/{m.handle}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {m.roles
            .filter((r) => ROLE_LABEL[r])
            .map((r) => (
              <span
                key={r}
                className="border-primary text-primary rounded-full border px-2.5 py-0.5 font-mono text-xs"
              >
                {ROLE_LABEL[r]}
              </span>
            ))}
          {m.banned ? (
            <span className="border-destructive/60 text-destructive rounded-full border px-2.5 py-0.5 font-mono text-xs">
              Banned
            </span>
          ) : null}
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {m.clips} {m.clips === 1 ? "clip" : "clips"} · joined {formatDate(m.createdAt)}
          </span>
        </div>
      </div>

      {m.banned && m.banReason ? (
        <p className="text-muted-foreground mt-2 text-sm">
          Banned for: {m.banReason}
          {m.banExpires ? ` (until ${formatDate(m.banExpires)})` : " (no end date)"}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canBan && m.banned ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => unbanAction(m.id))}
          >
            Unban
          </Button>
        ) : mayBan ? (
          <Button
            variant="ghost"
            onClick={() => setPanel(panel === "ban" ? "none" : "ban")}
            aria-expanded={panel === "ban"}
          >
            Ban
          </Button>
        ) : null}
        {canSetRoles ? (
          <Button
            variant="ghost"
            onClick={() => setPanel(panel === "roles" ? "none" : "roles")}
            aria-expanded={panel === "roles"}
          >
            Roles
          </Button>
        ) : null}
        <ActionMessage result={result} />
      </div>

      {panel === "ban" && mayBan && !m.banned ? (
        <form
          className="border-border mt-3 flex flex-wrap items-end gap-3 border-t pt-3"
          action={(form) => run(() => banAction(m.id, form))}
        >
          <label className="grid flex-1 gap-1.5 text-sm">
            Reason (they see it when they try to sign in)
            <input name="reason" required maxLength={200} className={field} />
          </label>
          <label className="grid gap-1.5 text-sm">
            How long
            <select name="days" className={field} defaultValue="7">
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="0">No end date</option>
            </select>
          </label>
          <Button type="submit" variant="destructive" disabled={pending}>
            Ban {m.name}
          </Button>
        </form>
      ) : null}

      {panel === "roles" && canSetRoles ? (
        <form
          className="border-border mt-3 flex flex-wrap items-center gap-4 border-t pt-3"
          action={(form) => run(() => rolesAction(m.id, form))}
        >
          {(["creator", "mod", "admin"] as const).map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="role"
                value={r}
                defaultChecked={m.roles.includes(r)}
                disabled={isMe && r === "admin"}
                className="accent-primary size-5"
              />
              {ROLE_LABEL[r]}
              {isMe && r === "admin" ? <input type="hidden" name="role" value="admin" /> : null}
            </label>
          ))}
          <Button type="submit" disabled={pending}>
            Save roles
          </Button>
        </form>
      ) : null}
    </li>
  );
}
