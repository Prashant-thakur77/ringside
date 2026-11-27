"use client";
// Closing call to action: tickets from the real match (fills and stale rejections at their ticks) fly in
// from every side and settle around the bell as you scroll.
import Link from "next/link";
import { useMemo, useRef } from "react";
import { gsap, useGSAP, reduced } from "@/lib/motion";
import { useGap } from "@/lib/home-data";

// Fixed landing spots (percent of the stage) so the layout is stable; tickets avoid the centre.
const SPOTS: [number, number, number][] = [
  [6, 8, -9], [24, 2, 6], [68, 4, -4], [86, 12, 8], [2, 40, 5], [88, 42, -7], [8, 72, -6],
  [27, 82, 4], [66, 84, -5], [84, 72, 7], [40, 0, -3], [52, 90, 3], [14, 22, 2], [76, 26, -2],
];

export function BellCta({ liveId }: { liveId?: string }) {
  const root = useRef<HTMLElement>(null);
  const { data: gap } = useGap();
  const tickets = useMemo(() => {
    const w = gap?.window ?? [];
    return SPOTS.map((s, i) => {
      const x = w[Math.floor((i / SPOTS.length) * w.length)] ?? { tick: 0, p: 0.5 };
      const stale = i % 3 === 1;
      return { s, tick: x.tick, p: x.p, stale };
    });
  }, [gap]);

  useGSAP(
    () => {
      if (reduced()) return;
      gsap.utils.toArray<HTMLElement>(".fly").forEach((el, i) => {
        const a = (i / SPOTS.length) * Math.PI * 2;
        gsap.from(el, {
          x: Math.cos(a) * 900, y: Math.sin(a) * 600, rotate: (i % 2 ? 1 : -1) * 40, opacity: 0, ease: "power3.out",
          scrollTrigger: { trigger: root.current, start: "top 85%", end: "center 55%", scrub: 0.8 },
        });
      });
      gsap.from(".bell-title .w", { yPercent: 110, stagger: 0.06, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: root.current, start: "top 45%" } });
    },
    { scope: root, dependencies: [gap], revertOnUpdate: true },
  );

  return (
    <section ref={root} className="relative overflow-hidden bg-hue-dark px-4 py-32 text-chalk md:min-h-[110vh] md:py-0" aria-labelledby="bell-title">
      <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden>
        {tickets.map((t, i) => (
          <div key={i} className="fly absolute w-[180px] rounded-xl bg-ticket-2 p-3 text-ink shadow-xl" style={{ left: `${t.s[0]}%`, top: `${t.s[1]}%`, transform: `rotate(${t.s[2]}deg)` }}>
            <p className="num text-[10px] text-ink-quiet">TICK {String(t.tick).padStart(6, "0")}</p>
            <p className="num text-[12px]">BUY {i % 2 ? "BLUE" : "RED"} @ {(i % 2 ? 1 - t.p : t.p).toFixed(3)}</p>
            <span className={`stamp mt-2 text-[11px] ${t.stale ? "text-stamp-red" : "text-stamp-blue"}`} style={{ animation: "none" }}>{t.stale ? "REJECTED · STALE" : "FILLED"}</span>
          </div>
        ))}
      </div>
      <div className="relative mx-auto flex max-w-[900px] flex-col items-center text-center md:min-h-[110vh] md:justify-center">
        <p className="label">NEXT BOUT</p>
        <h2 id="bell-title" className="bell-title display mt-3 text-[clamp(56px,9vw,150px)] font-semibold">
          {["Ring", "the bell"].map((w) => <span key={w} className="block overflow-hidden"><span className="w inline-block">{w}</span></span>)}
        </h2>
        <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-chalk-quiet">Watch an AI bout and trade it with devnet test-dollars, or step into the ring yourself against the PPO fighter.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={liveId ? `/m/${liveId}` : "/#card"} className="press num rounded-md bg-mint px-6 py-4 text-[14px] font-semibold text-slate">{liveId ? "WATCH THE LIVE MATCH" : "SEE TONIGHT'S CARD"}</Link>
          <Link href="/fight" className="press num rounded-md border border-chalk/40 px-6 py-4 text-[14px] font-semibold text-chalk hover:border-chalk">FIGHT AN AI</Link>
        </div>
      </div>
    </section>
  );
}
