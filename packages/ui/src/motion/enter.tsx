"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Hero entrance: runs once on load. Children marked [data-enter] rise 16px and fade in, in order.
 * Content is visible without JS and under reduced motion (we only animate *from* a hidden state).
 */
export function Enter({
  children,
  className,
  delay = 0.1,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-enter]", {
        y: 16,
        autoAlpha: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.08,
        delay,
        clearProps: "transform,opacity,visibility",
      });
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
