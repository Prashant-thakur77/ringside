"use client";
// Full-screen menu: the red and the blue corner shards sweep in from the MENU tab and the links rise
// from masks, right-aligned. Esc closes, focus stays inside, the page behind stops scrolling.
import Link from "next/link";
import { PAGES } from "@/lib/nav";
import { useEffect, useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/motion";

const LINKS: [string, string][] = [["Home", "/"], ...PAGES.map((p) => [p.label, p.href] as [string, string]), ["Waitlist", "/#waitlist"]];
const CLOSED = "polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%)";

export function Menu({ open, onClose, liveId }: { open: boolean; onClose: () => void; liveId?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      gsap.set(root.current, { autoAlpha: 0 });
      gsap.set(q(".shard"), { clipPath: CLOSED });
      tl.current = gsap
        .timeline({ paused: true, defaults: { ease: "expo.out" } })
        .set(root.current, { autoAlpha: 1 })
        .to(q(".dim"), { opacity: 1, duration: 0.4 }, 0)
        .to(q(".shard-red"), { clipPath: "polygon(0% 0%, 100% 6%, 100% 100%, 54% 100%)", duration: 0.8 }, 0)
        .to(q(".shard-blue"), { clipPath: "polygon(0% 0%, 100% 14%, 100% 100%, 60% 100%)", duration: 0.85 }, 0.07)
        .from(q(".menu-link"), { yPercent: 110, duration: 0.7, stagger: 0.045 }, 0.22)
        .from(q(".menu-foot"), { opacity: 0, y: 10, duration: 0.4 }, 0.5);
    },
    { scope: root },
  );

  useEffect(() => {
    const t = tl.current;
    if (!t) return;
    if (open) {
      if (reduced()) t.progress(1);
      else t.timeScale(1).play();
      document.documentElement.style.overflow = "hidden";
      setTimeout(() => root.current?.querySelector<HTMLElement>("a")?.focus(), 60);
    } else {
      if (reduced()) t.progress(0);
      else t.timeScale(1.7).reverse();
      document.documentElement.style.overflow = "";
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !root.current) return;
      const f = [...root.current.querySelectorAll<HTMLElement>("a,button")];
      const [first, last] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === first) (last.focus(), e.preventDefault());
      else if (!e.shiftKey && document.activeElement === last) (first.focus(), e.preventDefault());
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  return (
    <div ref={root} id="site-menu" role="dialog" aria-modal="true" aria-label="Menu" className="invisible fixed inset-0 z-50" aria-hidden={!open}>
      <div className="dim absolute inset-0 bg-slate/70 opacity-0" onClick={onClose} />
      <div className="shard shard-red absolute inset-0 bg-hue-deep" />
      <div className="shard shard-blue absolute inset-0 bg-hue" />
      <nav className="absolute inset-0 flex flex-col items-end justify-center px-5 pt-16 md:px-10" aria-label="Menu links">
        <ul className="text-right">
          {[...(liveId ? ([["Watch the live match", `/m/${liveId}`]] as [string, string][]) : []), ...LINKS].map(([label, href]) => (
            <li key={href} className="overflow-hidden">
              <Link href={href} onClick={onClose} className="menu-link display group inline-block text-[clamp(40px,7.2vw,104px)] font-semibold leading-[.92] text-slate">
                <span className="relative inline-block transition-transform duration-300 group-hover:-translate-x-3 group-focus-visible:-translate-x-3" style={{ transitionTimingFunction: "var(--ease-snap)" }}>
                  {label}
                  <span className="absolute -bottom-1 left-0 h-[4px] w-full origin-right scale-x-0 bg-slate transition-transform duration-300 group-hover:origin-left group-hover:scale-x-100" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="menu-foot num mt-10 flex gap-6 text-[13px] text-slate/80">
          <a href="https://github.com/Prashant-thakur77/ringside" target="_blank" rel="noreferrer" className="hover:text-slate">GitHub ↗</a>
          <span>Solana devnet · test-dollars only</span>
        </div>
      </nav>
    </div>
  );
}
