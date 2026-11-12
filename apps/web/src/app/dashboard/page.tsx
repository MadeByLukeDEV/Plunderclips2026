import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@plunderclips/ui/components/button";
import { rolesOf } from "@plunderclips/identity";
import { requireSession } from "@/lib/auth-guard";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="bg-card h-40 animate-pulse rounded-2xl" />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const session = await requireSession("/dashboard");
  const roles = rolesOf(session);
  return (
    <div>
      <h1 className="text-h2">Ahoy, {session.user.name}</h1>
      <p className="text-muted-foreground mt-3">
        Signed in as {session.user.email}
        {roles.length ? ` · ${roles.join(", ")}` : null}
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="border-border bg-card rounded-2xl border p-6">
          <h2 className="text-h3 font-medium">Your channels</h2>
          <p className="text-muted-foreground mt-2">
            Link Twitch, Kick, YouTube and Discord so your profile shows every place people can
            watch you.
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href="/dashboard/accounts">Manage linked accounts</Link>
          </Button>
        </div>
        <div className="border-border bg-card rounded-2xl border p-6">
          <h2 className="text-h3 font-medium">Your clips</h2>
          <p className="text-muted-foreground mt-2">
            Clips you submit while signed in show up here with their review status.
          </p>
          <Button asChild className="mt-6">
            <Link href="/submit">Submit a clip</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
