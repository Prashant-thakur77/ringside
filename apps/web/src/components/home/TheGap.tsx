"use client";
// The signature: scroll through real ticks of a devnet match around its biggest hit. The ring and the
// Ringside book move together; the TV feed and the TV-delay book run 50 ticks (5 s) behind. A courtsider
// who sees the hit at the venue sends the same stale order to both books: FILLED on the delayed book,
// REJECTED · STALE TICK on Ringside, by the program's own rule (seen tick more than 2 behind the book).
import { useMemo, useRef, useState } from "react";
import { ScrollTrigger, useGSAP, reduced } from "@/lib/motion";
import { useGap, STALE_TICKS } from "@/lib/home-data";

const DELAY = 50; // ticks = 5 s at 100 ms per tick
const pad = (n: number) => String(Math.max(0, n)).padStart(6, "0");
const clock = (t: number) => {
  const ms = t * 100;
  return `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}.${Math.floor((ms % 1000) / 100)}`;
};

function Price({ v, tone }: { v: number; tone: "red" | "blue" }) {
  const s = v.toFixed(3);
  return (
    <span className="num inline-flex gap-[3px]">
      {s.split("").map((c, i) => (
        <span key={i} className={`flap h-[1.25em] w-[.78em] text-[clamp(20px,3.4vw,52px)] ${tone === "red" ? "text-hue" : "text-beige"}`}>
          <span key={c} className="changed">{c}</span>
        </span>
      ))}
    </span>
  );
}

export function TheGap() {
  const root = useRef<HTMLElement>(null);
  const { data: gap } = useGap();
  const [t, setT] = useState<number | null>(null);
  const P = useMemo(() => new Map((gap?.window ?? []).map((x) => [x.tick, x.p])), [gap]);
  const hit = gap?.hit_tick ?? 0;
  const t0 = hit - 12, t1 = hit + 58;
  const shot = hit + 3; // the courtsider reacts 3 ticks after seeing the hit at the venue
  const stampAt = shot + 6; // the books answer: shown with step 04

  useGSAP(
    () => {
      if (!gap) return;
      if (reduced()) return setT(t1);
      ScrollTrigger.create({
        trigger: root.current, start: "top top", end: "bottom bottom",
        onUpdate: (s) => setT(Math.round(t0 + s.progress * (t1 - t0))),
      });
    },
    { scope: root, dependencies: [gap], revertOnUpdate: true },
  );

  const T = t ?? t0;
  const tv = T - DELAY;
  const pAt = (k: number) => P.get(k) ?? P.get(Math.max(...[...P.keys()].filter((x) => x <= k))) ?? 0.5;
  const pLive = pAt(T), pTv = pAt(tv);
  const shotSeen = shot - DELAY;
  const paid = pAt(shotSeen), worth = pAt(shot);
  const phase = T < hit ? 0 : T < shot ? 1 : T < shot + 6 ? 2 : tv < hit ? 3 : 4;
  const captions = [
    "The ring and the Ringside book move together: one instruction steps the fight and re-prices the book.",
    `Tick ${hit}: red lands a hit. Ringside re-prices in the same instruction, ${pAt(hit - 1).toFixed(3)} → ${pAt(hit).toFixed(3)}.`,
    "Someone at the venue saw it. They buy red on both books, at the price the TV feed still shows.",
    `The delayed book fills at ${paid.toFixed(3)} a share already worth ${worth.toFixed(3)}. Ringside rejects the order: it saw tick ${shotSeen}, the book is at ${shot}.`,
    "Five seconds later the TV catches up. On Ringside the edge never existed.",
  ];
  const step = (dir: number) => {
    const el = root.current!;
    const total = el.offsetHeight - innerHeight;
    window.scrollBy({ top: (dir * total) / (t1 - t0) * 6, behavior: "auto" });
  };

  return (
    <section
      id="gap" ref={root} className="relative h-[280vh] bg-slate text-chalk md:h-[300vh]" aria-labelledby="gap-title"
      onKeyDown={(e) => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); }}
    >
      <div className="sticky top-0 flex h-[100svh] flex-col px-3 pb-4 pt-14 md:px-8 md:pb-6 md:pt-16">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label">THE GAP · DEVNET MATCH #{gap?.match_id ?? "…"} · REAL TICKS</p>
            <h2 id="gap-title" className="display mt-2 text-[clamp(40px,6vw,96px)] font-semibold">The five-second gap</h2>
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="Step through the ticks">
            <button onClick={() => step(-1)} className="press num rounded-full border border-rule px-4 py-2 text-[13px] hover:border-chalk-quiet" aria-label="Back six ticks">◀ ticks</button>
            <button onClick={() => step(1)} className="press num rounded-full border border-rule px-4 py-2 text-[13px] hover:border-chalk-quiet" aria-label="Forward six ticks">ticks ▶</button>
          </div>
        </div>

        <div className="mx-auto mt-3 grid w-full max-w-[1400px] grid-cols-2 content-start gap-2 md:mt-6 md:gap-4">
          <p className="col-span-2 text-[14px] leading-snug text-chalk md:hidden" aria-live="polite"><span className="num text-hue">{String(phase + 1).padStart(2, "0")}</span> {captions[phase]}</p>
          {/* the venue */}
          <div className={`relative overflow-hidden rounded-2xl p-4 transition-colors duration-200 md:p-5 ${T >= hit && T < hit + 4 ? "bg-hue text-slate" : "bg-slate-2"}`}>
            <p className="num text-[10px] opacity-80 md:text-[12px]">AT THE VENUE · ON RINGSIDE</p>
            <p className="num mt-1 text-[clamp(13px,2.6vw,36px)] font-semibold">{clock(T)} · TICK {pad(T)}</p>
            <p className="display mt-1 text-[clamp(15px,2.4vw,34px)] font-semibold md:mt-3">{T >= hit ? "Red landed the hit" : "Exchanging jabs"}</p>
            <div className="mt-2 flex items-end justify-between gap-4 md:mt-4">
              <div>
                <p className="num text-[11px] opacity-80">RINGSIDE BOOK · RED</p>
                <Price v={pLive} tone="red" />
              </div>
              <p className="num hidden text-right text-[11px] opacity-80 md:block">priced at tick {T}<br />same instruction as the fight</p>
            </div>
          </div>
          {/* the broadcast */}
          <div className="relative overflow-hidden rounded-2xl bg-hue-dark p-4 md:p-5">
            <p className="num text-[10px] text-chalk-quiet md:text-[12px]">ON TV · 5 S BEHIND</p>
            <p className="num mt-1 text-[clamp(13px,2.6vw,36px)] font-semibold">{clock(Math.max(0, tv))} · TICK {pad(tv)}</p>
            <p className="display mt-1 text-[clamp(15px,2.4vw,34px)] font-semibold md:mt-3">{tv >= hit ? "Red landed the hit" : "Exchanging jabs"}</p>
            <div className="mt-2 flex items-end justify-between gap-4 md:mt-4">
              <div>
                <p className="num text-[11px] text-chalk-quiet">TV-DELAY BOOK · RED</p>
                <Price v={pTv} tone="blue" />
              </div>
              <p className="num hidden text-right text-[11px] text-chalk-quiet md:block">priced off the stream<br />{DELAY} ticks late</p>
            </div>
          </div>
          {/* the two tickets */}
          <div className="col-span-2 grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_1.1fr] md:gap-4">
            <div className={`ticket relative rounded-2xl p-3 transition-opacity md:p-5 duration-300 ${T >= shot ? "opacity-100" : "opacity-25"}`}>
              <p className="num text-[11px] text-ink-quiet">ORDER · TV-DELAY BOOK</p>
              <p className="num mt-1 text-[12px] md:text-[15px]">BUY RED × 3 @ {paid.toFixed(3)} · seen tick {shotSeen}</p>
              {T >= stampAt && <span key="f" className="stamp-lg mt-3 text-[12px] text-stamp-blue md:mt-4 md:text-base" style={{ animation: "stamp 280ms var(--ease-snap)" }}>FILLED</span>}
              {T >= stampAt && <p className="num mt-3 text-[12px] text-ink-quiet">worth {worth.toFixed(3)} a share at tick {shot}: +{(worth - paid).toFixed(3)} edge</p>}
            </div>
            <div className={`ticket relative rounded-2xl p-3 transition-opacity md:p-5 duration-300 ${T >= shot ? "opacity-100" : "opacity-25"}`}>
              <p className="num text-[11px] text-ink-quiet">ORDER · RINGSIDE BOOK</p>
              <p className="num mt-1 text-[12px] md:text-[15px]">BUY RED × 3 @ {paid.toFixed(3)} · seen tick {shotSeen}</p>
              {T >= stampAt && <span key="r" className="stamp-lg mt-3 text-[12px] text-stamp-red md:mt-4 md:text-base" style={{ animation: "stamp 280ms var(--ease-snap)" }}>REJECTED · STALE TICK</span>}
              {T >= stampAt && <p className="num mt-3 text-[12px] text-ink-quiet">book at tick {shot}: {shot - shotSeen} ticks behind, limit {STALE_TICKS}</p>}
            </div>
            <div className="hidden flex-col justify-between rounded-2xl border border-rule p-5 md:flex">
              <ol className="space-y-2">
                {captions.map((c, i) => (
                  <li key={i} className={`flex gap-3 text-[14px] leading-snug transition-colors duration-200 ${i === phase ? "text-chalk" : i < phase ? "text-chalk-quiet" : "text-chalk-quiet/40"}`}>
                    <span className="num text-hue">{String(i + 1).padStart(2, "0")}</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 h-[3px] w-full overflow-hidden rounded bg-rule" aria-hidden>
                <div className="h-full bg-hue" style={{ width: `${((T - t0) / (t1 - t0)) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
