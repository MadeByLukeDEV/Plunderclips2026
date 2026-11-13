"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { Input } from "@plunderclips/ui/components/input";
import { Label } from "@plunderclips/ui/components/label";
import { submitClipAction, type SubmitState } from "@/app/submit/actions";
import { Turnstile } from "./turnstile";

const NOTE_MAX = 280;

type Props = { siteKey: string | null; signedInAs: string | null };

/** Each round is a fresh form with its own action state; "Submit another clip" starts the next one. */
export function SubmitForm(props: Props) {
  const [round, setRound] = useState(0);
  return <Round key={round} {...props} onAgain={() => setRound((r) => r + 1)} />;
}

function Round({ siteKey, signedInAs, onAgain }: Props & { onAgain: () => void }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitClipAction, {
    status: "idle",
  });

  if (state.status === "done") return <Done state={state} onAgain={onAgain} />;

  const err = state.status === "error" ? state : null;
  const showTitle =
    err?.error === "title_required" || err?.error === "title_too_long" || !!err?.title;
  const urlError =
    err && ["invalid_url", "unsupported_platform", "unsupported_url"].includes(err.error);

  return (
    <form action={action} className="grid gap-6" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="url">Clip link</Label>
        <Input
          id="url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder="https://clips.twitch.tv/…"
          defaultValue={err?.url}
          aria-invalid={urlError || undefined}
          aria-describedby="url-help"
        />
        <p id="url-help" className="text-muted-foreground text-sm">
          Twitch, YouTube, Kick, Medal, TikTok or X. Clips, videos and Shorts all work.
        </p>
      </div>

      {showTitle ? (
        <div className="grid gap-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            maxLength={120}
            required
            defaultValue={err?.title}
            aria-invalid={
              err?.error === "title_required" || err?.error === "title_too_long" || undefined
            }
          />
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="note">
          Note for the mods <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={NOTE_MAX}
          defaultValue={err?.note}
          placeholder="Whose stream it is, what to watch for…"
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px] md:text-sm"
        />
      </div>

      {!signedInAs && siteKey ? <Turnstile siteKey={siteKey} resetKey={state} /> : null}

      {err ? (
        <p role="alert" className="text-destructive text-sm">
          {err.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="size-5 animate-spin" /> : null}
          {pending ? "Checking the link…" : "Submit clip"}
        </Button>
        <p className="text-muted-foreground text-sm">
          {signedInAs ? (
            <>Submitting as {signedInAs}</>
          ) : (
            <>
              No account needed.{" "}
              <Link href="/sign-in?next=/submit" className="link-draw text-foreground">
                Sign in
              </Link>{" "}
              to get credit.
            </>
          )}
        </p>
      </div>
    </form>
  );
}

function Done({
  state,
  onAgain,
}: {
  state: Extract<SubmitState, { status: "done" }>;
  onAgain: () => void;
}) {
  const { clip, duplicate } = state;
  const heading = duplicate
    ? clip.status === "rejected"
      ? "Someone sent this one before"
      : "Already in the library"
    : clip.status === "approved"
      ? "Your clip is live"
      : "Thanks, it's in the queue";
  const body = duplicate
    ? clip.status === "approved"
      ? "This clip is already published. No need to send it again."
      : clip.status === "pending"
        ? "This clip is already waiting for a mod. It'll show up once it's approved."
        : "A mod looked at this clip earlier and didn't approve it."
    : clip.status === "approved"
      ? "It skipped the queue because you're a trusted creator."
      : "A mod reviews every clip before it goes up. That usually takes less than a day.";

  return (
    <div role="status" className="grid min-w-0 gap-6">
      <div className="border-border bg-card flex min-w-0 gap-4 rounded-2xl border p-4">
        {clip.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote platform thumbnail, any host
          <img
            src={clip.thumbnailUrl}
            alt=""
            className="aspect-video w-36 shrink-0 rounded-lg object-cover"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div className="min-w-0">
          <p className="line-clamp-2 font-medium">{clip.title}</p>
          <a
            href={clip.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground link-draw mt-1 inline-block text-sm"
          >
            Open on the platform
          </a>
        </div>
      </div>
      <div>
        <h2 className="text-h3 font-medium">{heading}</h2>
        <p className="text-muted-foreground mt-2">{body}</p>
      </div>
      <div>
        <Button type="button" variant="secondary" size="lg" onClick={onAgain}>
          Submit another clip
        </Button>
      </div>
    </div>
  );
}
