"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { cn } from "@plunderclips/ui/lib/utils";

const MAX = 8 * 1024 * 1024;

/**
 * Upload, replace or remove one image (a profile banner, a crew banner or logo). The server
 * re-encodes it; this only checks the size first so a huge file doesn't upload for nothing.
 */
export function ImageUpload({
  target,
  crewId,
  current,
  label,
  hint,
  shape = "banner",
}: {
  target: "profile-banner" | "crew-banner" | "crew-logo";
  crewId?: string;
  current: string | null;
  label: string;
  hint: string;
  shape?: "banner" | "logo";
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [preview, setPreview] = useState(current);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const query = `target=${target}${crewId ? `&crew=${crewId}` : ""}`;
  const id = `upload-${target}`;

  function upload(file: File) {
    setNote(null);
    if (file.size > MAX) return setNote("That file is over 8 MB.");
    start(async () => {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/uploads?${query}`, { method: "POST", body });
      const r = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (r.url) {
        setPreview(r.url);
        router.refresh();
      } else setNote(r.error ?? "That didn't upload. Try again.");
    });
  }

  function remove() {
    setNote(null);
    start(async () => {
      const res = await fetch(`/api/uploads?${query}`, { method: "DELETE" });
      if (res.ok) {
        setPreview(null);
        router.refresh();
      } else
        setNote(
          ((await res.json().catch(() => ({}))) as { error?: string }).error ??
            "Couldn't remove it.",
        );
    });
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
            // eslint-disable-next-line @next/next/no-img-element -- uploaded images are already sized WebP
            <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <ImagePlus className="text-muted-foreground size-6" aria-hidden />
          )}
          {pending ? (
            <span className="bg-background/70 absolute inset-0 grid place-items-center">
              <Loader2 className="size-6 animate-spin" aria-hidden />
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
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            {preview ? "Replace" : "Upload"}
          </Button>
          {preview ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={remove}>
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
