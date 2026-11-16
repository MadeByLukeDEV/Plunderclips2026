import type { Metadata, Viewport } from "next";
import { Big_Shoulders, DM_Sans, Geist_Mono } from "next/font/google";
import { MotionProvider } from "@plunderclips/ui/motion/motion-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-big-shoulders",
  axes: ["opsz"],
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Evaluated at build time: the Docker build gets SITE_URL as a build arg (see docker/Dockerfile).
  metadataBase: new URL(
    process.env.SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Plunderclips: Sea of Thieves clips from streamers",
    template: "%s · Plunderclips",
  },
  description:
    "Share Sea of Thieves clips from Twitch, YouTube and Kick without an account. Weekly picks, best-of reels and streamers to sail with.",
  openGraph: { type: "website", siteName: "Plunderclips", images: ["/art/fishermen-at-sea.jpg"] },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#10141b", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${dmSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Marks JS as available before paint, so JS-only hidden states never hide content without JS. */}
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
      </head>
      <body className="min-h-dvh antialiased">
        <MotionProvider>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="outline-none">
            {children}
          </main>
          <SiteFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
