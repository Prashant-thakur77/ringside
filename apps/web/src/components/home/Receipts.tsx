"use client";
// Real receipts from a devnet match, one per slide: what happened, the stamp, and the explorer link.
// Swipe, drag, arrow keys or the buttons. The art sits in a ring-corner chevron.
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { gsap, useGSAP, reduced } from "@/lib/motion";

const SLIDES = [
  { k: "trade_fill", tag: "FILL", stamp: "FILLED", tone: "text-stamp-blue", bg: "#f4845f",
    t: "A spectator buys red at the live price. The book was priced in the same instruction as the tick the order saw, so it fills." },
  { k: "stale_reject", tag: "STALE ORDER", stamp: "REJECTED · STALE TICK", tone: "text-stamp-red", bg: "#d4572f",
    t: "The courtsider sends an order stamped with a tick six behind the book. The program refuses it with ErrStaleTick: nothing fills, nothing moves." },
  { k: "fighter_reject", tag: "FIGHTER BARRED", stamp: "REJECTED · FIGHTER", tone: "text-stamp-red", bg: "#0b0c14",
    t: "A fighter tries to trade their own match. Fighters and their session keys are barred from both books of their bout." },
  { k: "match_record", tag: "ON SOLANA", stamp: "RECORDED", tone: "text-stamp-blue", bg: "#2b1611",
    t: "At the bell the rollup commits the match to Solana and a Magic Action writes a MatchRecord: winner, final state hash and both books' totals." },
] as const;

export function Receipts() {
  const root = useRef<HTMLElement>(null);
  const [i, setI] = useState(0);
  const { data: links } = useQuery({ queryKey: ["links"], queryFn: async () => (await fetch("/home/links.json")).json() as Promise<Record<string, string>>, staleTime: Infinity });
  const go = (d: number) => setI((x) => (x + d + SLIDES.length) % SLIDES.length);
  const s = SLIDES[i];
  const startX = useRef<number | null>(null);

  useGSAP(
    () => {
      if (reduced()) return;
      gsap.fromTo(".rc-art", { clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)" }, { clipPath: "polygon(0% 0%, 100% 50%, 100% 50%, 0% 100%)", duration: 0.8, ease: "expo.out" });
      gsap.from(".rc-text", { y: 24, opacity: 0, duration: 0.6, ease: "expo.out" });
    },
    { scope: root, dependencies: [i], revertOnUpdate: true },
  );

  return (
    <section
      ref={root} className="bg-paper px-4 py-24 text-slate md:px-8 md:py-32" aria-roledescription="carousel" aria-label="Receipts from a devnet match"
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }}
      onPointerDown={(e) => (startX.current = e.clientX)}
      onPointerUp={(e) => { if (startX.current != null && Math.abs(e.clientX - startX.current) > 50) go(e.clientX < startX.current ? 1 : -1); startX.current = null; }}
    >
      <div className="mx-auto max-w-[1400px]">
        <p className="label !text-ink-quiet">RECEIPTS</p>
        <p className="num mt-1 text-[15px]">{s.tag}</p>
        <div className="mt-8 grid items-center gap-10 md:grid-cols-[1fr_1.1fr]">
          <div aria-live="polite">
            <p className="rc-text serif text-[clamp(26px,2.8vw,44px)] leading-[1.15]">{s.t}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {links?.[s.k] && (
                <a href={links[s.k]} target="_blank" rel="noreferrer" className="press num rounded-md bg-slate px-5 py-3 text-[13px] font-semibold text-chalk">OPEN ON THE EXPLORER ↗</a>
              )}
              <span className="flex items-center gap-3">
              <span className="num text-[13px] text-ink-quiet">{String(i + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}</span>
              <button onClick={() => go(-1)} className="press grid h-11 w-11 place-items-center rounded-full border border-slate/30 hover:bg-slate hover:text-chalk" aria-label="Previous receipt">←</button>
              <button onClick={() => go(1)} className="press grid h-11 w-11 place-items-center rounded-full border border-slate/30 hover:bg-slate hover:text-chalk" aria-label="Next receipt">→</button>
              </span>
            </div>
          </div>
          <div className="rc-art relative aspect-[1.35] w-full" style={{ background: s.bg, clipPath: "polygon(0% 0%, 100% 50%, 100% 50%, 0% 100%)" }}>
            <div className="absolute left-[8%] top-1/2 w-[52%] -translate-y-1/2 rotate-[-4deg] rounded-xl bg-ticket-2 p-5 shadow-2xl">
              <p className="num text-[11px] text-ink-quiet">RINGSIDE · DEVNET-TEE</p>
              <p className="num mt-2 text-[13px] text-ink">{s.tag}</p>
              <div className="perf mt-3 h-2" />
              <span className={`stamp-lg mt-4 text-[clamp(13px,1.3vw,18px)] ${s.tone}`}>{s.stamp}</span>
            </div>
          </div>
        </div>
        <div className="mt-10 h-[3px] w-full overflow-hidden rounded bg-slate/10" aria-hidden>
          <div className="h-full bg-slate transition-[width] duration-500" style={{ width: `${((i + 1) / SLIDES.length) * 100}%` }} />
        </div>
      </div>
    </section>
  );
}
