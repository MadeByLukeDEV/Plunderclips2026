import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { enabledProviders, getAuth } from "@plunderclips/identity";
import { requireSession } from "@/lib/auth-guard";
import { isProviderKey } from "@/components/auth/providers";
import { LinkedAccounts } from "@/components/dashboard/linked-accounts";

export const metadata: Metadata = { title: "Linked accounts" };

export default function AccountsPage() {
  return (
    <div>
      <h1 className="text-h2">Linked accounts</h1>
      <p className="text-muted-foreground mt-3 max-w-[56ch]">
        Sign in with any linked platform. Linked channels appear on your public profile once
        profiles go live.
      </p>
      <div className="mt-10">
        <Suspense fallback={<div className="bg-card h-64 animate-pulse rounded-2xl" />}>
          <Accounts />
        </Suspense>
      </div>
    </div>
  );
}

async function Accounts() {
  await requireSession("/dashboard/accounts");
  const accounts = await getAuth().api.listUserAccounts({ headers: await headers() });
  const linked = accounts.flatMap((a) =>
    isProviderKey(a.providerId)
      ? [
          {
            id: a.id,
            providerId: a.providerId,
            accountId: a.accountId,
            createdAt: new Date(a.createdAt).toISOString(),
          },
        ]
      : [],
  );
  const available = enabledProviders().filter(isProviderKey);
  return <LinkedAccounts linked={linked} available={available} />;
}
