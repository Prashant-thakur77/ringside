"use client";
// Footer finale: the wordmark's letters rise from the rope line, shading from coral to beige.
import Link from "next/link";
import { useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/motion";
import { Mark } from "./Logo";

const WORD = "RINGSIDE".split("");
const mix = (i: number) => {
  // coral → beige across the word
  const t = i / (WORD.length - 1);
  const a = [244, 132, 95], b = [231, 213, 189];
  return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * t)).join(",")})`;
};

export function Footer() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.from(".foot-l", {
        yPercent: 105, duration: 1.1, stagger: 0.05, ease: "expo.out",
        scrollTrigger: { trigger: ".foot-word", start: "top 95%" },
      });
      gsap.from(".foot-rope", { scaleX: 0, duration: 1, stagger: 0.08, ease: "expo.out", transformOrigin: "left", scrollTrigger: { trigger: ".foot-word", start: "top 98%" } });
    },
    { scope: root },
  );
  return (
    <footer ref={root} className="relative overflow-hidden bg-slate-3 text-chalk">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 pb-10 pt-20 md:grid-cols-[1.3fr_1fr] md:px-8">
        <div>
          <p className="display text-[clamp(40px,5vw,76px)] font-semibold">The in-play book that can&apos;t be courtsided</p>
          <div className="num mt-10 space-y-1 text-[13px] text-chalk-quiet">
            <p className="flex items-center gap-2 text-chalk"><Mark size={14} /> Ringside</p>
            <p>Built on MagicBlock ephemeral rollups</p>
            <p>Live on Solana devnet · test-dollars only</p>
          </div>
        </div>
        <nav aria-label="Footer">
          <p className="label mb-3">EXPLORE</p>
          <ul className="space-y-1">
            {[["Tonight's card", "/#card"], ["Fight an AI", "/fight"], ["How it works", "/#gap"], ["Proof", "/proof"], ["Docs", "/docs"], ["Waitlist", "/#waitlist"]].map(([l, h]) => (
              <li key={h}>
                <Link href={h} className="serif text-[30px] text-chalk transition-colors hover:text-hue">{l}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="num mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 border-t border-rule px-4 py-5 text-[12px] text-chalk-quiet md:px-8">
        <div className="flex flex-wrap gap-6">
          <a href="https://github.com/Prashant-thakur77/ringside" target="_blank" rel="noreferrer" className="hover:text-chalk">GitHub ↗</a>
          <Link href="/docs#program" className="hover:text-chalk">Program reference</Link>
          <span>No real money. Positions use devnet test-dollars.</span>
        </div>
        <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }); }} className="press rounded-full border border-rule px-4 py-2 text-chalk hover:border-hue">
          Back to the bell ↑
        </a>
      </div>
      <div className="foot-word mx-auto max-w-[1400px] px-4 pb-6 md:px-8" aria-hidden>
        <div className="space-y-[6px]">
          {[0.7, 0.5, 0.35].map((o) => <div key={o} className="foot-rope h-[3px] rounded bg-chalk" style={{ opacity: o }} />)}
        </div>
        <div className="wordmark-giant mt-3 overflow-hidden">
          {WORD.map((c, i) => (
            <span key={i} className="foot-l inline-block" style={{ color: mix(i) }}>{c}</span>
          ))}
        </div>
      </div>
    </footer>
  );
}
