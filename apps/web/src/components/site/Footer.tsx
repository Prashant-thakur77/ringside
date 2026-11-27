"use client";
// Footer finale. The ropes draw, then the giant wordmark slides in letter by letter as you scroll to the end of the
// page (scrubbed, like the reference), shading coral to beige. Each letter lifts under the pointer. Explore links
// grow an arrow on hover.
import Link from "next/link";
import { PAGES, MCP_PKG } from "@/lib/nav";
import { useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/motion";
import { Mark } from "./Logo";

const WORD = "RINGSIDE".split("");
const mix = (i: number) => {
  const t = i / (WORD.length - 1);
  const a = [244, 132, 95], b = [231, 213, 189];
  return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * t)).join(",")})`;
};

export function Footer() {
  const root = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      // letters slide in from the right, each a little further out, scrubbed by the last stretch of scroll
      gsap.fromTo(".foot-l", { xPercent: (i) => 60 + i * 55, yPercent: 30, opacity: 0 }, {
        xPercent: 0, yPercent: 0, opacity: 1, ease: "none", stagger: 0.04,
        scrollTrigger: { trigger: root.current, start: "top 85%", end: "bottom bottom", scrub: 0.8 },
      });
      gsap.from(".foot-rope", { scaleX: 0, duration: 1.1, stagger: 0.1, ease: "expo.out", transformOrigin: "left",
        scrollTrigger: { trigger: ".foot-word", start: "top 98%" } });
      gsap.from(".foot-in", { y: 30, opacity: 0, duration: 0.9, stagger: 0.06, ease: "expo.out",
        scrollTrigger: { trigger: root.current, start: "top 80%" } });
    },
    { scope: root },
  );
  return (
    <footer ref={root} className="relative overflow-hidden bg-slate-3 text-chalk">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 pb-10 pt-20 md:grid-cols-[1.3fr_1fr] md:px-8">
        <div>
          <p className="foot-in display text-[clamp(40px,5vw,76px)] font-semibold leading-[1.02]">The in-play book that can&apos;t be courtsided</p>
          <div className="foot-in mt-8 flex flex-wrap gap-3">
            <Link href="/play" className="press num rounded-full bg-hue px-5 py-3 text-[13px] font-semibold text-slate transition-transform hover:-translate-y-0.5">TRADE A FIGHT →</Link>
            <Link href="/agents" className="press num rounded-full border border-chalk/30 px-5 py-3 text-[13px] font-semibold transition-colors hover:border-mint hover:text-mint">npx -y {MCP_PKG}</Link>
          </div>
          <div className="foot-in num mt-10 space-y-1 text-[13px] text-chalk-quiet">
            <p className="flex items-center gap-2 text-chalk"><Mark size={14} /> Ringside</p>
            <p>Built on MagicBlock ephemeral rollups</p>
            <p>Live on Solana devnet · test-dollars only</p>
          </div>
        </div>
        <nav aria-label="Footer" className="foot-in">
          <p className="label mb-3">EXPLORE</p>
          <ul className="space-y-1">
            {[{ label: "Home", href: "/" }, ...PAGES].map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="foot-link serif group inline-flex items-baseline text-[30px] text-chalk transition-colors hover:text-hue">
                  <span className="arrow" aria-hidden>→</span>
                  <span className="relative">
                    {p.label}
                    <span className="absolute -bottom-[2px] left-0 h-[2px] w-full origin-right scale-x-0 bg-hue transition-transform duration-500 group-hover:origin-left group-hover:scale-x-100" />
                  </span>
                  {"isNew" in p && p.isNew && <span className="num ml-3 rounded-full bg-mint px-2 py-[2px] text-[10px] font-semibold text-slate">NEW</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="num mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 border-t border-rule px-4 py-5 text-[12px] text-chalk-quiet md:px-8">
        <div className="flex flex-wrap gap-6">
          <a href="https://github.com/Prashant-thakur77/ringside" target="_blank" rel="noreferrer" className="hover:text-chalk">GitHub ↗</a>
          <a href={`https://www.npmjs.com/package/${MCP_PKG}`} target="_blank" rel="noreferrer" className="hover:text-chalk">npm ↗</a>
          <Link href="/docs#program" className="hover:text-chalk">Program reference</Link>
          <span>No real money. Positions use devnet test-dollars.</span>
        </div>
        <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }); }} className="press group rounded-full border border-rule px-4 py-2 text-chalk transition-colors hover:border-hue hover:bg-hue hover:text-slate">
          Back to the bell <span className="inline-block transition-transform group-hover:-translate-y-1">↑</span>
        </a>
      </div>
      <div className="foot-word mx-auto max-w-[1400px] px-4 pb-6 md:px-8">
        <div className="space-y-[6px]" aria-hidden>
          {[0.7, 0.5, 0.35].map((o) => <div key={o} className="foot-rope h-[3px] rounded bg-chalk" style={{ opacity: o }} />)}
        </div>
        <div className="wordmark-giant mt-3 overflow-hidden" aria-label="Ringside">
          {WORD.map((c, i) => (
            <span key={i} className="foot-l inline-block" aria-hidden>
              <span className="foot-h" style={{ color: mix(i) }}>{c}</span>
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
