import Link from "next/link";
import { cn } from "@plunderclips/ui/lib/utils";

/** Sub-navigation for crew members: the crew page, its board, its calendar and its chat. */
export function CrewTabs({
  slug,
  current,
}: {
  slug: string;
  current: "crew" | "board" | "calendar";
}) {
  const tabs = [
    ["crew", "Crew", `/crews/${slug}`],
    ["board", "Board", `/crews/${slug}/board`],
    ["calendar", "Calendar", `/crews/${slug}/calendar`],
    ["chat", "Chat", `/chat/crew/${slug}`],
  ] as const;
  return (
    <nav aria-label="Crew" className="flex flex-wrap gap-1">
      {tabs.map(([id, label, href]) => (
        <Link
          key={id}
          href={href}
          aria-current={id === current ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-lg px-4 text-sm font-medium transition-colors",
            id === current
              ? "bg-card text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
