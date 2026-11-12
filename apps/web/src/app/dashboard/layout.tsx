import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap grid-12 min-h-svh items-start pt-[calc(var(--header-h)+48px)] pb-24">
      <aside className="col-span-12 md:col-span-3">
        <DashboardNav />
      </aside>
      <div className="col-span-12 mt-8 md:col-span-9 md:mt-0">{children}</div>
    </div>
  );
}
