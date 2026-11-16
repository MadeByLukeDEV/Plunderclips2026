"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { Banner } from "@plunderclips/creators";
import { Button } from "@plunderclips/ui/components/button";
import { Input } from "@plunderclips/ui/components/input";
import { Label } from "@plunderclips/ui/components/label";
import { cn } from "@plunderclips/ui/lib/utils";
import { createCrewAction, updateCrewAction, type CrewFormState } from "@/app/crews/actions";
import { bannerArt } from "@/lib/art";

export type CrewFormValues = {
  slug: string;
  name: string;
  motto: string;
  banner: Banner;
  joinPolicy: "open" | "request";
  sevenTvSetId: string | null;
};

const MOTTO_MAX = 160;

const POLICIES = [
  ["request", "By request", "People ask to join; the captain or an officer lets them in."],
  ["open", "Open", "Any creator can join straight away."],
] as const;

/** Founds a crew (no crewId) or edits one. */
export function CrewForm({ initial, crewId }: { initial: CrewFormValues; crewId?: string }) {
  const [state, action, pending] = useActionState<CrewFormState, FormData>(
    crewId ? updateCrewAction.bind(null, crewId) : createCrewAction,
    { status: "idle" },
  );
  const [banner, setBanner] = useState<Banner>(initial.banner);
  const [policy, setPolicy] = useState(initial.joinPolicy);
  const [motto, setMotto] = useState(initial.motto);
  const errors = state.status === "error" ? state.errors : {};
  const err = (k: string) =>
    errors[k] ? (
      <p id={`${k}-error`} className="text-destructive text-sm">
        {errors[k]}
      </p>
    ) : null;
  const invalid = (k: string) =>
    errors[k] ? { "aria-invalid": true, "aria-describedby": `${k}-error` } : {};

  return (
    <form action={action} className="grid max-w-2xl gap-8" noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">Crew name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={initial.name}
            maxLength={40}
            required
            autoComplete="off"
            {...invalid("name")}
          />
          {err("name")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="slug">Link</Label>
          <div className="relative">
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm">
              /crews/
            </span>
            <Input
              id="slug"
              name="slug"
              defaultValue={initial.slug}
              maxLength={24}
              required
              autoComplete="off"
              spellCheck={false}
              className="pl-18 font-mono"
              {...invalid("slug")}
            />
          </div>
          {err("slug") ?? (
            <p className="text-muted-foreground text-sm">3 to 24 letters, numbers, - or _.</p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="motto">Motto</Label>
          <span
            className={cn(
              "font-mono text-xs tabular-nums",
              motto.length > MOTTO_MAX ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {motto.length}/{MOTTO_MAX}
          </span>
        </div>
        <Input
          id="motto"
          name="motto"
          value={motto}
          onChange={(e) => setMotto(e.target.value)}
          placeholder="What you sail for, when you're on the water"
          autoComplete="off"
          {...invalid("motto")}
        />
        {err("motto")}
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">How people join</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {POLICIES.map(([value, label, hint]) => (
            <label
              key={value}
              className={cn(
                "has-[:focus-visible]:ring-ring/50 bg-card cursor-pointer rounded-xl border-2 p-4 transition-colors has-[:focus-visible]:ring-[3px]",
                policy === value ? "border-headline" : "hover:border-border border-transparent",
              )}
            >
              <input
                type="radio"
                name="joinPolicy"
                value={value}
                checked={policy === value}
                onChange={() => setPolicy(value)}
                className="sr-only"
              />
              <span className="block font-medium">{label}</span>
              <span className="text-muted-foreground mt-1 block text-sm">{hint}</span>
            </label>
          ))}
        </div>
        {err("joinPolicy")}
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="sevenTvSet">
          7TV emote set <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="sevenTvSet"
          name="sevenTvSet"
          defaultValue={
            initial.sevenTvSetId ? `https://7tv.app/emote-sets/${initial.sevenTvSetId}` : ""
          }
          placeholder="https://7tv.app/emote-sets/…"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          {...invalid("sevenTvSet")}
        />
        {err("sevenTvSet") ?? (
          <p className="text-muted-foreground text-sm">
            Make a set on 7tv.app, add the emotes your crew uses, and paste its link. They show in
            the crew channel. Changes on 7TV show up within the hour.
          </p>
        )}
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">Banner</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(Object.keys(bannerArt) as Banner[]).map((b) => (
            <label
              key={b}
              className={cn(
                "has-[:focus-visible]:ring-ring/50 relative aspect-[3/2] cursor-pointer overflow-hidden rounded-lg border-2 transition-colors has-[:focus-visible]:ring-[3px]",
                banner === b ? "border-headline" : "hover:border-border border-transparent",
              )}
            >
              <input
                type="radio"
                name="banner"
                value={b}
                checked={banner === b}
                onChange={() => setBanner(b)}
                className="sr-only"
              />
              <Image
                src={bannerArt[b].src}
                alt={bannerArt[b].alt}
                fill
                sizes="160px"
                className="object-cover"
              />
            </label>
          ))}
        </div>
        {err("banner")}
      </fieldset>

      {state.status === "error" && state.form ? (
        <p role="alert" className="text-destructive text-sm">
          {state.form}
        </p>
      ) : null}
      {state.status === "error" && !state.form && Object.keys(errors).length ? (
        <p role="alert" className="text-destructive text-sm">
          A few things need fixing above.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="size-5 animate-spin" /> : null}
          {crewId ? "Save changes" : "Found the crew"}
        </Button>
        {state.status === "saved" ? (
          <p role="status" className="text-sm">
            Saved.{" "}
            <Link href={`/crews/${state.slug}`} className="link-draw font-medium">
              View the crew
            </Link>
          </p>
        ) : null}
      </div>
    </form>
  );
}
