import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { REPORT_REASONS } from "@plunderclips/moderation";
import { channelFor, listInbox, listMessages, toWire } from "@plunderclips/social";
import { Avatar } from "@/components/creators/avatar";
import { Inbox } from "@/components/chat/inbox";
import { Thread } from "@/components/chat/thread";
import { requireSession } from "@/lib/auth-guard";

type Props = { params: Promise<{ channelId: string }> };

export default function ChannelPage(props: Props) {
  return (
    <Suspense fallback={<div className="bg-card h-[70svh] animate-pulse rounded-2xl" />}>
      <Channel {...props} />
    </Suspense>
  );
}

async function Channel({ params }: Props) {
  const { channelId } = await params;
  const session = await requireSession(`/chat/${channelId}`);
  const me = session.user.id;
  const channel = await channelFor(channelId, me);
  if (!channel) notFound();
  const [inbox, page] = await Promise.all([listInbox(me), listMessages(channel.id)]);

  return (
    <div className="grid-12 items-start">
      <aside className="col-span-4 hidden md:block lg:col-span-3">
        <Inbox items={inbox} current={channel.id} />
      </aside>
      <section
        aria-labelledby="channel-title"
        className="border-border bg-background col-span-12 flex h-[calc(100svh-var(--header-h)-72px)] min-h-[420px] flex-col md:col-span-8 md:border-l md:pl-6 lg:col-span-9"
      >
        <header className="border-border flex items-center gap-3 border-b pb-4">
          <Link
            href="/chat"
            className="text-muted-foreground hover:text-foreground grid size-11 place-items-center md:hidden"
          >
            <ArrowLeft className="size-5" aria-hidden />
            <span className="sr-only">All conversations</span>
          </Link>
          {channel.kind === "dm" ? (
            <Avatar name={channel.title} image={channel.image} className="size-10 text-[40px]" />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1
              id="channel-title"
              className="text-foreground truncate font-sans text-lg font-medium tracking-normal normal-case"
            >
              {channel.title}
            </h1>
            <Link
              href={channel.kind === "crew" ? `/crews/${channel.slug}` : `/c/${channel.handle}`}
              className="link-draw text-muted-foreground font-mono text-xs"
            >
              {channel.kind === "crew" ? "Crew channel" : `@${channel.handle}`}
            </Link>
          </div>
        </header>
        <Thread
          key={channel.id}
          channelId={channel.id}
          meId={me}
          initial={page.messages.map(toWire)}
          hasOlder={page.hasOlder}
          reasons={REPORT_REASONS}
        />
      </section>
    </div>
  );
}
