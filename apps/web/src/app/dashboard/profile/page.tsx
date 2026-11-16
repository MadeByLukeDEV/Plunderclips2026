import { Suspense } from "react";
import type { Metadata } from "next";
import { getProfileByUser, suggestHandle } from "@plunderclips/creators";
import { mediaEnabled } from "@plunderclips/media";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { ImageUpload } from "@/components/media/image-upload";
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
    <div className="grid max-w-2xl gap-12">
      {profile && mediaEnabled() ? (
        <ImageUpload
          target="profile-banner"
          current={profile.bannerUrl}
          label="Your own banner"
          hint="Shown instead of the artwork you pick below. JPEG, PNG, WebP, AVIF or GIF up to 8 MB, cropped to 3:1."
        />
      ) : null}
      <ProfileForm
        isNew={!profile}
        initial={{
          handle: profile?.handle ?? suggestHandle(session.user.name),
          displayName: profile?.displayName ?? session.user.name.slice(0, 40),
          bio: profile?.bio ?? "",
          banner: profile?.banner ?? "galleon-cove",
          channels,
        }}
      />
    </div>
  );
}
