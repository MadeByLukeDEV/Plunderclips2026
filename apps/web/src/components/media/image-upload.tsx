"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { cn } from "@plunderclips/ui/lib/utils";

const MAX = 8 * 1024 * 1024;
export type UploadTarget = "profile-banner" | "crew-banner" | "crew-logo";

/**
 * Every upload on the page goes through one queue, so a banner and a logo picked straight after
 * each other are processed one at a time instead of racing each other on the server.
 */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => {});
  return next;
}

/** Sends one image to /api/uploads. Never throws: a failure comes back as a message. */
export function uploadImage(
  target: UploadTarget,
  file: File,
  crewId?: string,
): Promise<{ url: string } | { error: string }> {
  if (file.size > MAX) return Promise.resolve({ error: "That file is over 8 MB." });
  return enqueue(async () => {
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/uploads?target=${target}${crewId ? `&crew=${crewId}` : ""}`, {
        method: "POST",
        body,
      });
      const r = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && r.url) return { url: r.url };
      return {
        error:
          r.error ??
          (res.status === 413
            ? "That file is too big."
            : `That didn't upload (error ${res.status}). Try again.`),
      };
    } catch {
      return { error: "The upload was cut off. Check your connection and try again." };
    }
  });
}

type Props = {
  target: UploadTarget;
  crewId?: string;
  current: string | null;
  label: string;
  hint: string;
  shape?: "banner" | "logo";
  /**
   * Deferred mode (founding a crew, which has no id yet): picking a file only previews it and hands
   * it to the parent, which uploads it once the crew exists.
   */
  onPick?: (file: File | null) => void;
};

/** Upload, replace or remove one image: a profile banner, or a crew banner or logo. */
export function ImageUpload({
  target,
  crewId,
  current,
  label,
  hint,
  shape = "banner",
  onPick,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  // undefined: show what the server has; null: removed; string: just uploaded or picked.
  const [override, setOverride] = useState<string | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = override === undefined ? current : override;
  const id = `upload-${target}`;

  // Object URLs for deferred previews are freed when replaced or on unmount.
  useEffect(() => {
    return () => {
      if (override?.startsWith("blob:")) URL.revokeObjectURL(override);
    };
  }, [override]);

  async function pick(file: File) {
    setNote(null);
    if (file.size > MAX) return setNote("That file is over 8 MB.");
    if (onPick) {
      setOverride(URL.createObjectURL(file));
      onPick(file);
      return;
    }
    setBusy(true);
    const r = await uploadImage(target, file, crewId);
    setBusy(false);
    if ("url" in r) {
      setOverride(r.url);
      router.refresh();
    } else setNote(r.error);
  }

  async function remove() {
    setNote(null);
    if (onPick) {
      setOverride(null);
      onPick(null);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/uploads?target=${target}${crewId ? `&crew=${crewId}` : ""}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setOverride(null);
        router.refresh();
      } else
        setNote(
          ((await res.json().catch(() => ({}))) as { error?: string }).error ??
            "Couldn't remove it.",
        );
    } catch {
      setNote("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <p id={`${id}-label`} className="text-sm font-medium">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            "bg-card border-border relative grid shrink-0 place-items-center overflow-hidden border",
            shape === "logo" ? "size-24 rounded-2xl" : "aspect-[3/1] w-full max-w-md rounded-xl",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded or picked image preview
            <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <ImagePlus className="text-muted-foreground size-6" aria-hidden />
          )}
          {busy ? (
            <span className="bg-background/70 absolute inset-0 grid place-items-center">
              <Loader2 className="size-6 animate-spin" aria-hidden />
              <span className="sr-only">Uploading</span>
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            className="sr-only"
            aria-labelledby={`${id}-label`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void pick(f);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {preview ? "Replace" : onPick ? "Choose image" : "Upload"}
          </Button>
          {preview ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void remove()}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {note ? (
        <p role="alert" className="text-destructive text-sm">
          {note}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">{hint}</p>
      )}
    </div>
  );
}
