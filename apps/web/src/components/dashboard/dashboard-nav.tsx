"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@plunderclips/ui";

const items = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/accounts", label: "Linked accounts" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard">
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {items.map((item) => {
          const active = pathname === item.href;
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
