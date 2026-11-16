"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { Input } from "@plunderclips/ui/components/input";
import { Label } from "@plunderclips/ui/components/label";
import { createLfcAction, type LfcFormState } from "@/app/looking-for-crew/actions";
import { PLATFORM, REGION, SHIP, STYLE } from "./lfc-labels";

const select =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]";

export function LfcForm({ crews }: { crews: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<LfcFormState, FormData>(createLfcAction, {
    status: "idle",
  });
  return (
    <form action={action} className="grid max-w-2xl gap-8">
      {crews.length ? (
        <div className="grid gap-2">
          <Label htmlFor="lfc-crew">Post as</Label>
          <select id="lfc-crew" name="crewId" defaultValue="" className={select}>
            <option value="">Me: I&apos;m looking for a crew</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}: we&apos;re recruiting
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="lfc-title">Title</Label>
        <Input
          id="lfc-title"
          name="title"
          maxLength={80}
          required
          placeholder="Chill sloop sailor looking for evening crew"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="lfc-body">
          More about it <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <textarea
          id="lfc-body"
          name="body"
          rows={4}
          maxLength={500}
          placeholder="What you like to do, how often you stream, what you're after"
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px] md:text-sm"
        />
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        {(
          [
            ["region", "Region", REGION],
            ["platform", "Platform", PLATFORM],
            ["ship", "Ship", SHIP],
          ] as const
        ).map(([name, label, labels]) => (
          <div key={name} className="grid gap-2">
            <Label htmlFor={`lfc-${name}`}>{label}</Label>
            <select id={`lfc-${name}`} name={name} defaultValue="any" className={select}>
              {Object.entries(labels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Playstyle (up to 5)</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(STYLE).map(([v, l]) => (
            <label
              key={v}
              className="border-border has-[:checked]:border-headline has-[:checked]:bg-card has-[:focus-visible]:ring-ring/50 flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm has-[:focus-visible]:ring-[3px]"
            >
              <input type="checkbox" name="styles" value={v} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor="lfc-when">
          When you play <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="lfc-when"
          name="availability"
          maxLength={80}
          placeholder="Weekday evenings, CET"
          autoComplete="off"
        />
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="justify-self-start">
        {pending ? <Loader2 className="size-5 animate-spin" /> : null}
        Post
      </Button>
    </form>
  );
}
