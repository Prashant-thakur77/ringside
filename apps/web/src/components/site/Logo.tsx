"use client";
// The Ringside mark: two corner pads joined by three ropes, then the wordmark.
// Load: the ropes draw between the corners, then the letters drop in. Hover: the letters jab.
import Link from "next/link";
import { useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/motion";

const WORD = "RINGSIDE";

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 32 20" aria-hidden className="logo-mark shrink-0">
      <rect x="0" y="2" width="7" height="16" rx="1.5" fill="var(--color-hue)" />
      <rect x="25" y="2" width="7" height="16" rx="1.5" fill="var(--color-beige)" />
      {[6, 10, 14].map((y) => (
        <line key={y} className="logo-rope" x1="7" x2="25" y1={y} y2={y} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ))}
    </svg>
  );
}

export function Logo({ intro = false, compact = false }: { intro?: boolean; compact?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useGSAP(
    () => {
      if (!intro || reduced()) return;
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from(".logo-rope", { strokeDasharray: 18, strokeDashoffset: 18, duration: 0.6, stagger: 0.06 })
        .from(".logo-l", { yPercent: -120, opacity: 0, duration: 0.7, stagger: 0.04 }, 0.2);
    },
    { scope: ref },
  );
  const jab = () => {
    if (reduced()) return;
    gsap.fromTo(ref.current!.querySelectorAll(".logo-l"), { y: 0 }, { y: (i) => (i % 2 ? 3 : -3), duration: 0.09, yoyo: true, repeat: 1, stagger: 0.02, ease: "power2.out" });
  };
  return (
    <Link ref={ref} href="/" onMouseEnter={jab} onFocus={jab} className="flex items-center gap-2 text-chalk" aria-label="Ringside home">
      <Mark />
      <span className={`display overflow-hidden text-[24px] font-semibold tracking-[.06em] ${compact ? "hidden sm:flex" : "flex"}`} aria-hidden>
        {WORD.split("").map((c, i) => (
          <span key={i} className="logo-l inline-block">{c}</span>
        ))}
      </span>
    </Link>
  );
}
