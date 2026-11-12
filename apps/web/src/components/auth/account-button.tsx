"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@plunderclips/ui/components/button";
import { authClient } from "@plunderclips/identity/client";

/** Header account control: "Sign in" when signed out, avatar + dashboard link and sign-out when signed in. */
export function AccountButton({
  onNavigate,
  stacked = false,
}: {
  onNavigate?: () => void;
  stacked?: boolean;
}) {
  const { data, isPending } = authClient.useSession();
  const router = useRouter();

  if (isPending || !data) {
    return (
      <Button variant={stacked ? "secondary" : "ghost"} size={stacked ? "lg" : "default"} asChild>
        <Link href="/sign-in" onClick={onNavigate}>
          Sign in
        </Link>
      </Button>
    );
  }

  const { user } = data;
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();

  async function signOut() {
    await authClient.signOut();
    onNavigate?.();
    router.refresh();
  }

  return (
    <div className={stacked ? "grid gap-3" : "flex items-center gap-1"}>
      <Button variant={stacked ? "secondary" : "ghost"} size={stacked ? "lg" : "default"} asChild>
        <Link href="/dashboard" onClick={onNavigate} className="gap-2">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- provider avatar, arbitrary host
            <img src={user.image} alt="" className="size-7 rounded-full object-cover" />
          ) : (
            <span
              aria-hidden
              className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-full text-sm"
            >
              {initial}
            </span>
          )}
          Dashboard
        </Link>
      </Button>
      <Button variant="ghost" size={stacked ? "lg" : "default"} onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
