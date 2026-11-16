import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <div className="wrap pt-[calc(var(--header-h)+32px)] pb-10">{children}</div>;
}
