import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { canSetRoles } from "@plunderclips/moderation";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireStaff } from "@/lib/staff";

// One generic title for every admin page: the tab doesn't say which tool is open (or that it exists)
// to someone who only sees the 404.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap grid-12 min-h-svh items-start pt-[calc(var(--header-h)+48px)] pb-24">
      <Suspense fallback={<div className="bg-card col-span-12 h-96 animate-pulse rounded-2xl" />}>
        <Guarded>{children}</Guarded>
      </Suspense>
    </div>
  );
}

/** Nothing under /admin renders, nav included, until the visitor is confirmed as staff. */
async function Guarded({ children }: { children: React.ReactNode }) {
  await connection();
  const { actor } = await requireStaff("/admin");
  return (
    <>
      <aside className="col-span-12 md:col-span-3 lg:col-span-2">
        <p className="text-muted-foreground mb-3 hidden font-mono text-xs tracking-wider uppercase md:block">
          {canSetRoles(actor) ? "Admin" : "Mod"}
        </p>
        <AdminNav />
      </aside>
      <div className="col-span-12 mt-8 min-w-0 md:col-span-9 md:mt-0 lg:col-span-10">
        {children}
      </div>
    </>
  );
}
