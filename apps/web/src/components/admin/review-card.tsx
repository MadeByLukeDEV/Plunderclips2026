"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { Label } from "@plunderclips/ui/components/label";
import { PlatformIcon } from "@plunderclips/ui/components/platform-icon";
import { cn } from "@plunderclips/ui/lib/utils";
import { reviewAction } from "@/app/admin/actions";
import { formatDate, formatDuration, platformMeta } from "@/components/clips/clip-meta";
import { ClipPlayer } from "@/components/clips/clip-player";
import { ActionMessage, useAdminAction } from "./use-action";

export type ReviewCardClip = {
  id: string;
  platform: "twitch" | "youtube" | "kick" | "medal" | "tiktok" | "x";
  kind: "clip" | "video" | "short" | "live" | "post";
  canonicalUrl: string;
  title: string;
  thumbnailUrl: string | null;
  authorName: string | null;
  authorUrl: string | null;
  durationSeconds: number | null;
  game: string | null;
  isSeaOfThieves: boolean | null;
  tags: string[];
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  submitterNote: string | null;
  submitterName: string | null;
  submitterTag: string | null;
  history: { total: number; approved: number };
  sections: { slug: string; period: string }[];
  voteCount: number;
  createdAt: string;
};

type Props = {
  clip: ReviewCardClip;
  playerSrc: string | null;
  tags: Record<string, string>;
  sections: { slug: string; title: string }[];
  reasons: Record<string, string>;
  canFeature: boolean;
};

const field =
  "border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-[3px]";

export function ReviewCard({ clip, playerSrc, tags, sections, reasons, canFeature }: Props) {
  const { pending, result, run } = useAdminAction();
  const [mode, setMode] = useState<"publish" | "reject">("publish");
  const meta = platformMeta[clip.platform];
  const duration = formatDuration(clip.durationSeconds);
  const live = clip.status === "approved";
  const picked = new Set(clip.sections.map((s) => s.slug));
  const done = result?.ok;

  // A React form action, not onSubmit: before hydration the form can\'t fall back to a native GET.
  const submit = (decision: string) => (form: FormData) => {
    form.set("decision", decision);
    run(() => reviewAction(clip.id, form));
  };

  return (
    <article
      aria-labelledby={`t-${clip.id}`}
      className={cn(
        "border-border bg-card grid gap-6 rounded-2xl border p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]",
        done && "opacity-60",
      )}
    >
      <div className="min-w-0">
        {/* No clipId: a mod previewing a clip is not a view. */}
        <ClipPlayer clip={clip} src={playerSrc} />
        <h2 id={`t-${clip.id}`} className="mt-4 font-medium">
          {clip.title}
        </h2>
        <dl className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Platform</dt>
            {meta.icon ? <PlatformIcon platform={meta.icon} className="size-4" /> : null}
            <dd>
              {clip.authorUrl ? (
                <a
                  href={clip.authorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-draw"
                >
                  {clip.authorName ?? meta.label}
                </a>
              ) : (
                (clip.authorName ?? meta.label)
              )}
            </dd>
          </div>
          {duration ? (
            <div>
              <dt className="sr-only">Length</dt>
              <dd className="font-mono">{duration}</dd>
            </div>
          ) : null}
          <div>
            <dt className="sr-only">Sent</dt>
            <dd>Sent {formatDate(clip.createdAt)}</dd>
          </div>
          <div>
            <a
              href={clip.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link-draw inline-flex items-center gap-1"
            >
              Open original <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </dl>

        {clip.isSeaOfThieves === false ? (
          <p className="border-destructive/50 text-destructive mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {meta.label} lists this as {clip.game ? `"${clip.game}"` : "another game"}, not Sea of
            Thieves.
          </p>
        ) : clip.isSeaOfThieves ? (
          <p className="text-primary mt-4 text-sm">{meta.label} lists this as Sea of Thieves.</p>
        ) : null}

        <div className="border-border mt-4 grid gap-1 border-t pt-4 text-sm">
          <p>
            <span className="text-muted-foreground">From </span>
            {clip.submitterName ?? (
              <>
                anonymous{" "}
                <span className="text-muted-foreground font-mono text-xs">
                  #{clip.submitterTag ?? "no ip"}
                </span>
              </>
            )}
            <span className="text-muted-foreground">
              {" "}
              ·{" "}
              {clip.history.total
                ? `${clip.history.approved} of ${clip.history.total} earlier clips approved`
                : "first clip"}
            </span>
          </p>
          {clip.submitterNote ? (
            <p className="border-border mt-1 border-l-2 pl-3">
              <span className="text-muted-foreground">Note: </span>
              {clip.submitterNote}
            </p>
          ) : null}
          {clip.status === "rejected" && clip.rejectReason ? (
            <p className="text-muted-foreground mt-1">Rejected: {clip.rejectReason}</p>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        {
          <div className="mb-4 flex gap-1" role="tablist" aria-label="Decision">
            {(
              [
                ["publish", live ? "Curate" : "Publish"],
                ["reject", live ? "Take down" : "Reject"],
              ] as const
            ).map(([m, label]) =>
              clip.status === "rejected" && m === "reject" ? null : (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "min-h-11 rounded-lg px-4 text-sm font-medium transition-colors",
                    mode === m
                      ? "bg-background text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        }

        {mode === "publish" ? (
          <form action={submit(live ? "update" : "approve")} className="grid gap-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Tags</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(tags).map(([slug, label]) => (
                  <label
                    key={slug}
                    className="border-border has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring/50 inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-sm transition-colors has-[:focus-visible]:ring-[3px]"
                  >
                    <input
                      type="checkbox"
                      name="tag"
                      value={slug}
                      defaultChecked={clip.tags.includes(slug)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {canFeature ? (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Pick for</legend>
                <div className="grid gap-2">
                  {sections.map((s) => (
                    <label
                      key={s.slug}
                      className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="section"
                        value={s.slug}
                        defaultChecked={picked.has(s.slug)}
                        className="accent-primary size-5"
                      />
                      {s.title}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending || done}>
                {live ? "Save" : clip.status === "rejected" ? "Publish after all" : "Publish"}
              </Button>
              <ActionMessage result={result} />
            </div>
          </form>
        ) : (
          <form action={submit(live ? "unpublish" : "reject")} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`reason-${clip.id}`}>Reason (the submitter sees it)</Label>
              <select
                id={`reason-${clip.id}`}
                name="reason"
                className={field}
                defaultValue="not_sot"
              >
                {Object.entries(reasons).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
                <option value="custom">Write my own</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`note-${clip.id}`}>Note (optional)</Label>
              <textarea
                id={`note-${clip.id}`}
                name="note"
                rows={2}
                maxLength={280}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="destructive" disabled={pending || done}>
                {live ? "Take down" : "Reject"}
              </Button>
              <ActionMessage result={result} />
            </div>
          </form>
        )}
        {clip.voteCount ? (
          <p className="text-muted-foreground mt-4 font-mono text-xs">{clip.voteCount} votes</p>
        ) : null}
      </div>
    </article>
  );
}
