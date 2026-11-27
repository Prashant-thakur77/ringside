"use client";
// One animation layer: GSAP + ScrollTrigger + SplitText, registered once on the client.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
  (window as unknown as { __st: typeof ScrollTrigger }).__st = ScrollTrigger;
}

export const SNAP = "cubic-bezier(.2,.9,.1,1)";
export const EASE = { snap: "expo.out", out: "power2.in" } as const;
export const DUR = { flip: 0.14, ui: 0.28, beat: 0.7, show: 1.4 } as const;
export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export { gsap, ScrollTrigger, SplitText, useGSAP };
