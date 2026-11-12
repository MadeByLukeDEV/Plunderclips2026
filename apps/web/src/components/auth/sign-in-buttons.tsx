"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { authClient } from "@plunderclips/identity/client";
import { providerMeta, type ProviderKey } from "./providers";

export function SignInButtons({ providers, next }: { providers: ProviderKey[]; next: string }) {
  const [pending, setPending] = useState<ProviderKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = authClient.getLastUsedLoginMethod?.();

  async function go(provider: ProviderKey) {
    setPending(provider);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: next,
      errorCallbackURL: "/sign-in",
    });
    if (error) {
      setError(error.message ?? "Sign-in failed. Try again.");
      setPending(null);
    }
  }

  return (
    <div className="grid gap-3">
      {providers.map((p) => {
        const meta = providerMeta[p];
        return (
          <Button
            key={p}
            variant="secondary"
            size="lg"
            className="relative justify-start gap-3"
            disabled={pending !== null}
            onClick={() => go(p)}
          >
            {pending === p ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <PlatformIcon platform={meta.icon} className="size-5" />
            )}
            Continue with {meta.label}
            {last === p ? (
              <span className="text-muted-foreground ml-auto font-mono text-xs tracking-wider uppercase">
                Last used
              </span>
            ) : null}
          </Button>
        );
      })}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
