"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { authClient } from "@plunderclips/identity/client";
import { providerMeta, type ProviderKey } from "@/components/auth/providers";

type Linked = { id: string; providerId: ProviderKey; accountId: string; createdAt: string };

export function LinkedAccounts({
  linked,
  available,
}: {
  linked: Linked[];
  available: ProviderKey[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const linkedIds = new Set(linked.map((a) => a.providerId));
  const canUnlink = linked.length > 1;
  const linkable = (Object.keys(providerMeta) as ProviderKey[]).filter((p) => !linkedIds.has(p));

  async function link(provider: ProviderKey) {
    setBusy(provider);
    setError(null);
    const { error } = await authClient.linkSocial({ provider, callbackURL: "/dashboard/accounts" });
    if (error) {
      setError(error.message ?? "Linking failed. Try again.");
      setBusy(null);
    }
  }

  async function unlink(account: Linked) {
    setBusy(account.id);
    setError(null);
    const { error } = await authClient.unlinkAccount({ accountId: account.accountId });
    setBusy(null);
    if (error) setError(error.message ?? "Unlinking failed. Try again.");
    else startTransition(() => router.refresh());
  }

  return (
    <div className="grid gap-8">
      <ul className="divide-border border-border bg-card divide-y rounded-2xl border">
        {linked.map((a) => {
          const meta = providerMeta[a.providerId];
          return (
            <li key={a.id} className="flex items-center gap-4 p-5">
              <PlatformIcon platform={meta.icon} className="size-6" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{meta.label}</p>
                <p className="text-muted-foreground text-sm">
                  Linked{" "}
                  {new Date(a.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canUnlink || busy !== null}
                title={canUnlink ? undefined : "Keep at least one account so you can still sign in"}
                onClick={() => unlink(a)}
                aria-label={`Unlink ${meta.label}`}
              >
                {busy === a.id ? <Loader2 className="size-4 animate-spin" /> : "Unlink"}
              </Button>
            </li>
          );
        })}
      </ul>

      {linkable.length > 0 ? (
        <div>
          <h2 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
            Link another platform
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {linkable.map((p) => {
              const meta = providerMeta[p];
              const enabled = available.includes(p);
              return (
                <Button
                  key={p}
                  variant="secondary"
                  size="lg"
                  className="justify-start gap-3"
                  disabled={!enabled || busy !== null}
                  onClick={() => link(p)}
                >
                  {busy === p ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <PlatformIcon platform={meta.icon} />
                  )}
                  {enabled ? `Link ${meta.label}` : `${meta.label} (not available yet)`}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
