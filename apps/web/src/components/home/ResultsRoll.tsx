"use client";
// Pinned results: a giant figure rolls behind a centre ticket as you scroll, one result at a time.
// Every figure is read from results.json (written by the evaluation scripts).
import { useRef, useState } from "react";
import { ScrollTrigger, useGSAP, reduced } from "@/lib/motion";
import { useResults, fmt } from "@/lib/home-data";

export function ResultsRoll() {
  const root = useRef<HTMLElement>(null);
  const [k, setK] = useState(0);
  const { data: r } = useResults();
  const stats = r
    ? [
        { big: fmt(r.e1.ringside.stale_rejections), unit: "", left: "Stale orders rejected", right: `Out of ${fmt(r.e1.ringside.stale_attempts)} the courtsider sent to Ringside, priced off a delayed stream, across ${r.e1.n_matches} devnet matches.`, stamp: "REJECTED", tone: "text-stamp-red" },
        { big: String(r.e1.ringside.stale_fills_accepted), unit: "", left: "Stale fills on Ringside", right: `On the TV-delay book the same orders filled ${fmt(r.e1.delays.reduce((a: number, d: { stale_fills_accepted: number }) => a + d.stale_fills_accepted, 0))} times.`, stamp: "NONE FILLED", tone: "text-stamp-red" },
        { big: String(Math.round(r.e3.tick_cadence_ms.p50)), unit: "ms", left: "Between ticks", right: `Median cadence of the crank on devnet-tee over ${fmt(r.e3.tick_cadence_ms.n)} ticks (p95 ${Math.round(r.e3.tick_cadence_ms.p95)} ms).`, stamp: "ON TIME", tone: "text-stamp-blue" },
        { big: `${r.e6.verified_wasm}/${r.e6.k}`, unit: "", left: "Replays verified", right: `Matches re-run in WASM and Python from their inputs and VRF seeds reproduce every one of ${fmt(r.e6.ticks_checked)} hash links.`, stamp: "VERIFIED", tone: "text-stamp-blue" },
      ]
    : [];

  useGSAP(
    () => {
      if (!stats.length || reduced()) return;
      ScrollTrigger.create({ trigger: root.current, start: "top top", end: "bottom bottom", onUpdate: (s) => setK(Math.min(stats.length - 1, Math.floor(s.progress * stats.length))) });
    },
    { scope: root, dependencies: [stats.length], revertOnUpdate: true },
  );
  if (!stats.length) return <section className="bg-hue md:h-[420vh]" aria-hidden />;
  const s = stats[k];

  return (
    <section ref={root} className="relative bg-hue text-slate md:h-[420vh]" aria-label="Results">
      <div className="hidden flex-col justify-center overflow-hidden px-8 md:sticky md:top-0 md:flex md:h-[100svh]">
        <p className="label !text-slate/70 mx-auto w-full max-w-[1400px]">MEASURED ON DEVNET · RESULTS.JSON</p>
        <div className="relative mx-auto mt-6 grid w-full max-w-[1400px] items-center gap-8 md:grid-cols-[1fr_auto_1fr]">
          <p className="display relative z-10 max-w-[12ch] text-[clamp(30px,3vw,48px)] font-semibold">{s.left}</p>
          <div className="relative grid place-items-center">
            <p key={s.big} className="display pointer-events-none absolute -top-[0.62em] whitespace-nowrap text-[clamp(110px,15vw,260px)] font-semibold leading-none text-white/75" style={{ animation: "roll 600ms var(--ease-snap)" }} aria-hidden>
              {s.big}<span className="text-[.3em]">{s.unit}</span>
            </p>
            <div className="ticket relative z-10 w-[min(78vw,380px)] rotate-[-3deg] rounded-2xl p-6 shadow-[0_30px_60px_-20px_rgba(0,0,0,.45)]">
              <p className="num text-[11px] text-ink-quiet">RINGSIDE · RESULT {k + 1} OF {stats.length}</p>
              <p className="num mt-2 text-[40px] font-semibold text-ink">{s.big}<span className="text-[18px]"> {s.unit}</span></p>
              <div className="perf my-3 h-2" />
              <span key={s.stamp} className={`stamp-lg ${s.tone}`} style={{ animation: "stamp 280ms var(--ease-snap)" }}>{s.stamp}</span>
            </div>
          </div>
          <p className="relative z-10 max-w-[30ch] justify-self-end text-[17px] leading-relaxed md:text-right">{s.right}</p>
        </div>
        <div className="mx-auto mt-10 flex w-full max-w-[1400px] gap-2" aria-hidden>
          {stats.map((_, i) => <span key={i} className={`h-[4px] flex-1 rounded ${i <= k ? "bg-slate" : "bg-slate/20"}`} />)}
        </div>
        <ul className="sr-only">{stats.map((x) => <li key={x.left}>{x.left}: {x.big} {x.unit}. {x.right}</li>)}</ul>
      </div>
      <div className="space-y-4 px-4 py-20 md:hidden">
        <p className="label !text-slate/70">MEASURED ON DEVNET · RESULTS.JSON</p>
        {stats.map((x, i) => (
          <div key={x.left} className="ticket rounded-2xl p-5" style={{ transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}>
            <p className="display text-[88px] font-semibold leading-none text-ink">{x.big}<span className="text-[18px]"> {x.unit}</span></p>
            <p className="display mt-2 text-[26px] font-semibold text-ink">{x.left}</p>
            <p className="mt-2 text-[15px] text-ink-quiet">{x.right}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
