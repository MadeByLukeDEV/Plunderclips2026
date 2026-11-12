"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { Banner, ChannelPlatform } from "@plunderclips/creators";
import { Button } from "@plunderclips/ui/components/button";
import { Input } from "@plunderclips/ui/components/input";
import { Label } from "@plunderclips/ui/components/label";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { cn } from "@plunderclips/ui/lib/utils";
import { saveProfileAction, type ProfileFormState } from "@/app/dashboard/profile/actions";
import { platformMeta } from "@/components/clips/clip-meta";
import { bannerArt } from "@/lib/art";

export type ProfileFormValues = {
  handle: string;
  displayName: string;
  bio: string;
  banner: Banner;
  channels: Partial<Record<ChannelPlatform, string>>;
};

const PLATFORMS: { id: ChannelPlatform; placeholder: string }[] = [
  { id: "twitch", placeholder: "twitch.tv/yourname" },
  { id: "youtube", placeholder: "youtube.com/@yourname" },
  { id: "kick", placeholder: "kick.com/yourname" },
  { id: "tiktok", placeholder: "@yourname" },
  { id: "x", placeholder: "@yourname" },
  { id: "medal", placeholder: "medal.tv/u/yourname" },
];

const BIO_MAX = 300;

export function ProfileForm({ initial, isNew }: { initial: ProfileFormValues; isNew: boolean }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfileAction, {
    status: "idle",
  });
  const [banner, setBanner] = useState<Banner>(initial.banner);
  const [bio, setBio] = useState(initial.bio);
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
          <Label htmlFor="displayName">Name</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={initial.displayName}
            maxLength={40}
            required
            autoComplete="nickname"
            {...invalid("displayName")}
          />
          {err("displayName")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="handle">Handle</Label>
          <div className="relative">
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm">
              /c/
            </span>
            <Input
              id="handle"
              name="handle"
              defaultValue={initial.handle}
              maxLength={24}
              required
              autoComplete="off"
              spellCheck={false}
              className="pl-10 font-mono"
              {...invalid("handle")}
            />
          </div>
          {err("handle") ?? (
            <p className="text-muted-foreground text-sm">3 to 24 letters, numbers, - or _.</p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="bio">Bio</Label>
          <span
            className={cn(
              "font-mono text-xs tabular-nums",
              bio.length > BIO_MAX ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {bio.length}/{BIO_MAX}
          </span>
        </div>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="What you stream, when you're live, what kind of crew you sail with"
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px] md:text-sm"
          {...invalid("bio")}
        />
        {err("bio")}
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">Banner</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(Object.keys(bannerArt) as Banner[]).map((b) => (
            <label
              key={b}
              className={cn(
                "has-[:focus-visible]:ring-ring/50 relative aspect-[3/2] cursor-pointer overflow-hidden rounded-lg border-2 transition-colors has-[:focus-visible]:ring-[3px]",
                banner === b ? "border-primary" : "hover:border-border border-transparent",
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

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-medium">Channels</legend>
        <p className="text-muted-foreground -mt-2 text-sm">
          Paste a link or type the name. Approved clips from these channels show on your page.
        </p>
        {PLATFORMS.map(({ id, placeholder }) => {
          const meta = platformMeta[id];
          const key = `channel.${id}`;
          return (
            <div key={id} className="grid gap-1.5">
              <div className="flex items-center gap-3">
                <Label htmlFor={key} className="flex w-24 shrink-0 items-center gap-2">
                  {meta.icon ? <PlatformIcon platform={meta.icon} className="size-4" /> : null}
                  {meta.label}
                </Label>
                <Input
                  id={key}
                  name={key}
                  defaultValue={initial.channels[id] ?? ""}
                  placeholder={placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  {...invalid(key)}
                />
              </div>
              {errors[key] ? <div className="sm:pl-27">{err(key)}</div> : null}
            </div>
          );
        })}
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
          {isNew ? "Create my page" : "Save changes"}
        </Button>
        {state.status === "saved" ? (
          <p role="status" className="text-sm">
            Saved.{" "}
            <Link href={`/c/${state.handle}`} className="link-draw font-medium">
              View your page
            </Link>
          </p>
        ) : null}
      </div>
    </form>
  );
}
