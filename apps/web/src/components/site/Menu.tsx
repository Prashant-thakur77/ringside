"use client";
// Full-screen menu: two corner shards sweep in under the header (MENU becomes CLOSE and stays on top), the page stays
// visible behind them, and the links rise from masks in the bottom-right. Hovering one link fades the rest.
// Esc closes, focus stays inside, the page behind stops scrolling.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { PAGES, MCP_PKG } from "@/lib/nav";
import { gsap, useGSAP, reduced } from "@/lib/motion";

type L = { label: string; href: string; isNew?: boolean };
const LINKS: L[] = [{ label: "Home", href: "/" }, ...PAGES, { label: "Waitlist", href: "/#waitlist" }];
const CLOSED = "polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%)";

export function Menu({ open, onClose, liveId }: { open: boolean; onClose: () => void; liveId?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const path = usePathname();

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      gsap.set(root.current, { autoAlpha: 0 });
      gsap.set(q(".shard"), { clipPath: CLOSED });
      tl.current = gsap
        .timeline({ paused: true, defaults: { ease: "expo.out" } })
        .set(root.current, { autoAlpha: 1 })
        .to(q(".dim"), { opacity: 1, duration: 0.4 }, 0)
        .fromTo(q(".shard-deep"), { clipPath: CLOSED }, { clipPath: "polygon(0% 0%, 100% 8%, 100% 100%, 50% 100%)", duration: 0.9 }, 0)
        .fromTo(q(".shard-main"), { clipPath: CLOSED }, { clipPath: "polygon(0% 6%, 100% 20%, 100% 100%, 64% 100%)", duration: 0.95 }, 0.06)
        .from(q(".menu-link"), { yPercent: 115, duration: 0.75, stagger: 0.04 }, 0.24)
        .from(q(".menu-num"), { opacity: 0, x: 10, duration: 0.4, stagger: 0.04 }, 0.4)
        .from(q(".menu-foot > *"), { opacity: 0, y: 12, duration: 0.45, stagger: 0.06 }, 0.5);
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
      setTimeout(() => root.current?.querySelector<HTMLElement>(".menu-link")?.focus(), 80);
    } else {
      if (reduced()) t.progress(0);
      else t.timeScale(1.8).reverse();
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

  const links: L[] = [...(liveId ? [{ label: "Watch live", href: `/m/${liveId}`, isNew: false }] : []), ...LINKS];
  const active = (h: string) => (h === "/" ? path === "/" : !h.includes("#") && path.startsWith(h));

  return (
    // z-30: under the sticky header (z-40), so the CLOSE tab and the logo stay visible, as on the reference.
    <div ref={root} id="site-menu" role="dialog" aria-modal="true" aria-label="Menu" className="invisible fixed inset-0 z-30" aria-hidden={!open}>
      <div className="dim absolute inset-0 bg-slate/60 opacity-0" onClick={onClose} />
      <div className="shard shard-deep absolute inset-0 bg-hue-deep" onClick={onClose} />
      <div className="shard shard-main absolute inset-0 origin-top-left bg-hue" />
      <nav className="absolute inset-0 flex flex-col items-end justify-end px-5 pb-10 pt-28 md:px-10 md:pb-12" aria-label="Menu links">
        <ul className="menu-list text-right">
          {links.map((l, i) => (
            <li key={l.href} className="overflow-hidden">
              <Link href={l.href} onClick={onClose} aria-current={active(l.href) ? "page" : undefined}
                className="menu-link display group inline-flex items-baseline gap-4 py-[2px] text-[clamp(34px,min(5.4vw,7.6vh),84px)] font-semibold leading-[.98] text-slate">
                <span className="menu-num num hidden text-[13px] font-medium tracking-[.1em] opacity-60 md:inline">
                  {l.isNew && <span className="mr-2 rounded-full bg-slate px-2 py-[2px] text-[10px] text-mint">NEW</span>}
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="relative inline-flex items-baseline transition-transform duration-500 group-hover:-translate-x-4 group-focus-visible:-translate-x-4" style={{ transitionTimingFunction: "var(--ease-snap)" }}>
                  <span aria-hidden className="mr-3 inline-block w-0 overflow-hidden text-[.7em] opacity-0 transition-all duration-500 group-hover:w-[1em] group-hover:opacity-100 group-focus-visible:w-[1em] group-focus-visible:opacity-100">→</span>
                  {l.label}
                  {active(l.href) && <span aria-hidden className="absolute -right-5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-slate md:-right-6" />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="menu-foot num mt-8 flex flex-wrap items-center justify-end gap-x-6 gap-y-2 text-[12px] text-slate/80">
          <a href="https://github.com/Prashant-thakur77/ringside" target="_blank" rel="noreferrer" className="hover:text-slate hover:underline">GitHub ↗</a>
          <a href={`https://www.npmjs.com/package/${MCP_PKG}`} target="_blank" rel="noreferrer" className="hover:text-slate hover:underline">npm · {MCP_PKG} ↗</a>
          <span>Solana devnet · test-dollars only</span>
        </div>
      </nav>
    </div>
  );
}
