import { Suspense } from "react";
import type { Metadata } from "next";
import { getProfileByUser, suggestHandle } from "@plunderclips/creators";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { requireSession } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Your page" };

export default function ProfilePage() {
  return (
    <div>
      <h1 className="text-h2">Your page</h1>
      <p className="text-muted-foreground mt-3 max-w-[56ch]">
        Your public page at plunderclips/c/your-handle: who you are, where you stream, and the clips
        people sent in from your channels.
      </p>
      <div className="mt-10">
        <Suspense fallback={<div className="bg-card h-96 max-w-2xl animate-pulse rounded-2xl" />}>
          <Editor />
        </Suspense>
      </div>
    </div>
  );
}

async function Editor() {
  const session = await requireSession("/dashboard/profile");
  const profile = await getProfileByUser(session.user.id);
  const channels = Object.fromEntries((profile?.channels ?? []).map((c) => [c.platform, c.handle]));
  return (
    <ProfileForm
      isNew={!profile}
      initial={{
        handle: profile?.handle ?? suggestHandle(session.user.name),
        displayName: profile?.displayName ?? session.user.name.slice(0, 40),
        bio: profile?.bio ?? "",
        banner: profile?.banner ?? "ninth-wave",
        channels,
      }}
    />
  );
}
