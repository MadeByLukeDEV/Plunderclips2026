import { Suspense } from "react";
import { listInbox } from "@plunderclips/social";
import { Inbox } from "@/components/chat/inbox";
import { requireSession } from "@/lib/auth-guard";

export default function ChatPage() {
  return (
    <section aria-labelledby="chat-title" className="max-w-2xl">
      <h1 id="chat-title" className="text-h2">
        Chat
      </h1>
      <p className="text-muted-foreground mt-3 mb-10 max-w-[56ch]">
        Your crews&apos; channels and your conversations with other creators.
      </p>
      <Suspense fallback={<div className="bg-card h-64 animate-pulse rounded-2xl" />}>
        <List />
      </Suspense>
    </section>
  );
}

async function List() {
  const session = await requireSession("/chat");
  return <Inbox items={await listInbox(session.user.id)} />;
}
