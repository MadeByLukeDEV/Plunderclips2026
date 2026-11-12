"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { Button } from "@plunderclips/ui/components/button";
import { cn } from "@plunderclips/ui";
import { clipSections, mainLinks } from "./nav-data";
import { Wordmark } from "./wordmark";
import { AccountButton } from "./auth/account-button";

const navLink =
  "inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-[15px] text-foreground/90 transition-colors hover:bg-accent hover:text-foreground";

export function SiteHeader() {
  const [megaOpen, setMegaOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const megaId = useId();
  const menuId = useId();
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMegaOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = menuOpen ? "hidden" : "";
  }, [menuOpen]);

  const openMega = () => {
    window.clearTimeout(closeTimer.current);
    setMegaOpen(true);
  };
  const closeMegaSoon = () => {
    closeTimer.current = window.setTimeout(() => setMegaOpen(false), 120);
  };

  return (
    <>
      <header className="nav border-border/60 bg-background/90 fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md">
        <a
          href="#main"
          className="bg-primary text-primary-foreground fixed top-3 left-3 z-[100] -translate-y-24 rounded-lg px-4 py-3 font-medium focus-visible:translate-y-0"
        >
          Skip to content
        </a>
        <div className="wrap flex h-[var(--header-h)] items-center gap-8">
          <Wordmark />

          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
            <div onPointerEnter={openMega} onPointerLeave={closeMegaSoon} className="relative">
              <button
                type="button"
                aria-expanded={megaOpen}
                aria-controls={megaId}
                onClick={() => setMegaOpen((o) => !o)}
                className={navLink}
              >
                Clips
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform duration-200",
                    megaOpen && "rotate-180",
                  )}
                />
              </button>
              <div
                id={megaId}
                hidden={!megaOpen}
                className="border-border bg-popover absolute top-full left-0 mt-2 w-[min(640px,80vw)] rounded-xl border p-2 shadow-2xl shadow-black/40"
              >
                <ul className="grid grid-cols-2 gap-1">
                  {clipSections.map((s) => (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        onClick={() => setMegaOpen(false)}
                        className="hover:bg-accent focus-visible:bg-accent block rounded-lg p-4 transition-colors"
                      >
                        <span className="block font-medium">{s.label}</span>
                        <span className="text-muted-foreground mt-1 block text-sm">{s.blurb}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {mainLinks.map((l) => (
              <Link key={l.href} href={l.href} className={navLink}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <AccountButton />
            <Button asChild>
              <Link href="/submit">Submit a clip</Link>
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="ml-auto md:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </Button>
        </div>
      </header>

      {/* Outside <header>: its backdrop-filter would make it the containing block of this fixed panel. */}
      <div
        id={menuId}
        hidden={!menuOpen}
        className="bg-background fixed inset-x-0 top-[var(--header-h)] bottom-0 z-40 overflow-y-auto md:hidden"
        data-lenis-prevent
      >
        <nav aria-label="Mobile" className="wrap flex flex-col gap-1 py-6">
          <p className="text-muted-foreground pb-2 font-mono text-xs tracking-wider uppercase">
            Clips
          </p>
          {clipSections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              onClick={() => setMenuOpen(false)}
              className="flex min-h-12 items-center text-lg"
            >
              {s.label}
            </Link>
          ))}
          <div className="bg-border my-3 h-px" />
          {mainLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="flex min-h-12 items-center text-lg"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-6 grid gap-3">
            <Button asChild size="lg">
              <Link href="/submit" onClick={() => setMenuOpen(false)}>
                Submit a clip
              </Link>
            </Button>
            <AccountButton stacked onNavigate={() => setMenuOpen(false)} />
          </div>
        </nav>
      </div>
    </>
  );
}
