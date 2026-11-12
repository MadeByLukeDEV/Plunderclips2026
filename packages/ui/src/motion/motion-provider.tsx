"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Smooth scroll (Lenis) driven by GSAP's ticker so ScrollTrigger and Lenis share one clock.
 * Under prefers-reduced-motion Lenis never starts: native scrolling, nothing animates.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const lenis = new Lenis({ autoRaf: false, lerp: 0.12, anchors: { offset: -80 } });
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const onChange = () => {
      if (reduced.matches) lenis.destroy();
    };
    reduced.addEventListener("change", onChange);

    return () => {
      reduced.removeEventListener("change", onChange);
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return children;
}
