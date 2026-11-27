"use client";
// Lenis smooth scroll driven by the GSAP ticker and synced to ScrollTrigger. Native speed is kept;
// off for reduced motion and touch (where native scrolling feels better).
import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger, reduced } from "@/lib/motion";

export function SmoothScroll() {
  useEffect(() => {
    if (reduced() || window.matchMedia("(pointer: coarse)").matches) return;
    const lenis = new Lenis({ lerp: 0.14, wheelMultiplier: 1 });
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);
  return null;
}
