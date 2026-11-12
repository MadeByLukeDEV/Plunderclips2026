"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "../lib/utils";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Part = string | { strong: string };

/**
 * Dealt moment "word-highlight": a statement rests at half ink and turns to ink word by word as it
 * crosses the middle of the screen (scrubbed, runs back on scroll up). Strong words turn to the accent.
 * Reduced motion / no JS: the whole statement in full ink.
 */
export function WordHighlight({ parts, className }: { parts: Part[]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  const words = parts.flatMap((part, pi) => {
    const strong = typeof part !== "string";
    const text = strong ? part.strong : part;
    return text
      .split(/\s+/)
      .filter(Boolean)
      .map((w, wi) => ({ w, strong, key: `${pi}-${wi}` }));
  });

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const nodes = gsap.utils.toArray<HTMLElement>("[data-w]", el);
      el.dataset.armed = "true";
      let shown = -1;
      ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        end: "bottom 45%",
        scrub: true,
        onUpdate: (self) => {
          const k = Math.round(self.progress * nodes.length);
          if (k === shown) return;
          shown = k;
          nodes.forEach((n, i) => n.toggleAttribute("data-on", i < k));
        },
      });
    },
    { scope: ref },
  );

  return (
    <p
      ref={ref}
      className={cn(
        "group font-display text-h2 max-w-[22ch] md:max-w-[26ch]",
        "[&_[data-w]]:transition-colors [&_[data-w]]:duration-150",
        "data-[armed]:[&_[data-w]]:text-[color-mix(in_oklab,var(--foreground)_45%,var(--background))]",
        "data-[armed]:[&_[data-w][data-on]]:text-foreground",
        "data-[armed]:[&_strong_[data-w][data-on]]:text-primary",
        className,
      )}
    >
      {words.map(({ w, strong, key }, i) => {
        const span = <span data-w>{w}</span>;
        return (
          <span key={key}>
            {strong ? <strong className="text-primary font-[inherit]">{span}</strong> : span}
            {i < words.length - 1 ? " " : null}
          </span>
        );
      })}
    </p>
  );
}
