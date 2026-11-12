import type { ClipStatus } from "@plunderclips/clips";
import { cn } from "@plunderclips/ui/lib/utils";

export const statusLabel: Record<ClipStatus, string> = {
  pending: "Waiting for review",
  approved: "Live",
  rejected: "Not approved",
};

export function ClipStatusBadge({ status }: { status: ClipStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs tracking-wide",
        status === "approved" && "border-primary text-primary",
        status === "pending" && "border-border text-muted-foreground",
        status === "rejected" && "border-destructive/60 text-destructive",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          status === "approved" && "bg-primary",
          status === "pending" && "bg-muted-foreground",
          status === "rejected" && "bg-destructive",
        )}
      />
      {statusLabel[status]}
    </span>
  );
}
