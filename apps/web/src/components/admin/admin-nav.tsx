"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@plunderclips/ui";

const items = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/queue", label: "Review queue" },
  { href: "/admin/sections", label: "Sections" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/users", label: "Members" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin">
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {items.map((item) => {
          const active =
            item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "hover:bg-accent flex min-h-11 items-center rounded-lg px-3 whitespace-nowrap transition-colors",
                  active ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
