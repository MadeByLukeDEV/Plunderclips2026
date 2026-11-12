import Link from "next/link";
import { cn } from "@plunderclips/ui";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "font-display inline-flex min-h-11 items-center text-[1.375rem] leading-none tracking-[-0.02em]",
        className,
      )}
    >
      Plunder<span className="text-primary">clips</span>
    </Link>
  );
}
