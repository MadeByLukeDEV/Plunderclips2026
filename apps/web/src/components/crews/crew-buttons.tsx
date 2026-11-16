"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { Input } from "@plunderclips/ui/components/input";
import { Label } from "@plunderclips/ui/components/label";
import { crewAction } from "@/app/crews/actions";

type Op = Parameters<typeof crewAction>[1];

/** Runs a crew action, refreshes the page on success, and shows the module's reason otherwise. */
function useCrewAction(slug: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const run = (op: Op) => {
    setNote(null);
    start(async () => {
      const r = await crewAction(slug, op);
      if (r) setNote(r);
      else router.refresh();
    });
  };
  return { pending, note, run };
}

function Note({ note }: { note: string | null }) {
  return note ? (
    <p role="status" className="text-muted-foreground mt-2 text-sm">
      {note}
    </p>
  ) : null;
}

/** Join, ask to join (with a note for the officers), cancel a request, or leave. */
export function JoinControls({
  slug,
  policy,
  standing,
}: {
  slug: string;
  policy: "open" | "request";
  standing: "none" | "requested" | "member" | "captain";
}) {
  const { pending, note, run } = useCrewAction(slug);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");
  const spin = pending ? <Loader2 className="size-5 animate-spin" /> : null;

  if (standing === "member" || standing === "captain")
    return (
      <div>
        <Button
          variant="secondary"
          size="lg"
          disabled={pending}
          onClick={() => run({ op: "leave" })}
        >
          {spin}
          Leave crew
        </Button>
        <Note note={note} />
      </div>
    );

  if (standing === "requested")
    return (
      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            variant="secondary"
            size="lg"
            disabled={pending}
            onClick={() => run({ op: "cancel" })}
          >
            {spin}
            Cancel request
          </Button>
          <p className="text-muted-foreground text-sm">Waiting for an officer to answer.</p>
        </div>
        <Note note={note} />
      </div>
    );

  if (policy === "open")
    return (
      <div>
        <Button size="lg" disabled={pending} onClick={() => run({ op: "join" })}>
          {spin}
          Join crew
        </Button>
        <Note note={note} />
      </div>
    );

  return (
    <div className="grid max-w-sm gap-3">
      {asking ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run({ op: "join", message });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="join-message">Note for the officers (optional)</Label>
            <Input
              id="join-message"
              value={message}
              maxLength={200}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Who you are, when you sail"
              autoComplete="off"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={pending}>
              {spin}
              Send request
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={() => setAsking(false)}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <Button size="lg" className="justify-self-start" onClick={() => setAsking(true)}>
          Ask to join
        </Button>
      )}
      <Note note={note} />
    </div>
  );
}

/** Let in or turn down one request. */
export function RequestButtons({
  slug,
  userId,
  name,
}: {
  slug: string;
  userId: string;
  name: string;
}) {
  const { pending, note, run } = useCrewAction(slug);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={pending} onClick={() => run({ op: "answer", userId, accept: true })}>
        Let in<span className="sr-only"> {name}</span>
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => run({ op: "answer", userId, accept: false })}
      >
        Turn down<span className="sr-only"> {name}</span>
      </Button>
      <Note note={note} />
    </div>
  );
}

/** Role changes and removal for one member, limited to what the viewer's own role allows. */
export function MemberButtons({
  slug,
  userId,
  name,
  role,
  viewer,
}: {
  slug: string;
  userId: string;
  name: string;
  role: "officer" | "deckhand";
  viewer: "captain" | "officer";
}) {
  const { pending, note, run } = useCrewAction(slug);
  const [confirm, setConfirm] = useState<"transfer" | "remove" | null>(null);
  const canRemove = viewer === "captain" || role === "deckhand";
  const who = <span className="sr-only"> {name}</span>;

  if (confirm)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm">
          {confirm === "transfer"
            ? `Make ${name} captain? You'll stay on as an officer.`
            : `Remove ${name}?`}
        </p>
        <Button
          variant={confirm === "remove" ? "destructive" : "default"}
          disabled={pending}
          onClick={() =>
            run(confirm === "transfer" ? { op: "transfer", userId } : { op: "remove", userId })
          }
        >
          {confirm === "transfer" ? "Hand over" : "Remove"}
        </Button>
        <Button variant="ghost" onClick={() => setConfirm(null)}>
          Keep
        </Button>
        <Note note={note} />
      </div>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {viewer === "captain" ? (
        <>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run({ op: "role", userId, role: role === "officer" ? "deckhand" : "officer" })
            }
          >
            {role === "officer" ? "Make deckhand" : "Make officer"}
            {who}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirm("transfer")}>
            Make captain{who}
          </Button>
        </>
      ) : null}
      {canRemove ? (
        <Button variant="ghost" disabled={pending} onClick={() => setConfirm("remove")}>
          Remove{who}
        </Button>
      ) : null}
      <Note note={note} />
    </div>
  );
}

/** Two-step disband for the captain or site staff. */
export function DisbandButton({ slug, name }: { slug: string; name: string }) {
  const { pending, note, run } = useCrewAction(slug);
  const [sure, setSure] = useState(false);
  return (
    <div>
      {sure ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">Disband {name} for good? Members and requests go with it.</p>
          <Button variant="destructive" disabled={pending} onClick={() => run({ op: "disband" })}>
            {pending ? <Loader2 className="size-5 animate-spin" /> : null}
            Disband
          </Button>
          <Button variant="ghost" onClick={() => setSure(false)}>
            Keep the crew
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setSure(true)}>
          Disband crew
        </Button>
      )}
      <Note note={note} />
    </div>
  );
}
