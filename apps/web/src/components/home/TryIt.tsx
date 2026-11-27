"use client";
// Play: be the courtsider. Pick how far behind the TV runs and send the order you would send after seeing
// the hit at the venue. The verdicts apply the program's rule to the real ticks of the devnet match, and
// the measured result for that delay comes from E1 in results.json.
import { useState } from "react";
import { useGap, useResults, STALE_TICKS } from "@/lib/home-data";

const DELAYS = [500, 1000, 2000, 5000, 8000];

export function TryIt() {
  const { data: gap } = useGap();
  const { data: r } = useResults();
  const [di, setDi] = useState(3);
  const [sent, setSent] = useState(0);
  const delay = DELAYS[di];
  const lag = delay / 100;
  const P = new Map((gap?.window ?? []).map((x) => [x.tick, x.p]));
  const pAt = (k: number) => P.get(k) ?? 0.5;
  const shot = (gap?.hit_tick ?? 0) + 3;
  const seen = shot - lag;
  const paid = pAt(seen), worth = pAt(shot);
  const stale = shot - seen > STALE_TICKS;
  const measured = r?.e1?.delays?.find((d: { delay_ms: number }) => d.delay_ms === delay);

  return (
    <section className="bg-slate px-4 py-24 text-chalk md:px-8 md:py-32" aria-labelledby="try-title">
      <div className="mx-auto grid max-w-[1400px] gap-12 md:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="label">YOUR TURN</p>
          <h2 id="try-title" className="display mt-2 text-[clamp(44px,6vw,96px)] font-semibold">Try to courtside it</h2>
          <p className="mt-5 max-w-[48ch] text-[17px] leading-relaxed text-chalk-quiet">
            You are at the venue. Red just landed a hit at tick {gap?.hit_tick ?? "…"}. The TV is behind you by the delay you pick. Buy red on both books at the price the TV still shows.
          </p>
          <label htmlFor="delay" className="num mt-10 block text-[13px] text-chalk-quiet">TV DELAY · <span className="text-hue">{(delay / 1000).toFixed(1)} s</span> = {lag} ticks</label>
          <input
            id="delay" type="range" min={0} max={DELAYS.length - 1} step={1} value={di}
            onChange={(e) => { setDi(Number(e.target.value)); setSent(0); }}
            className="mt-3 w-full max-w-[460px] accent-[var(--color-hue)]"
            aria-valuetext={`${(delay / 1000).toFixed(1)} seconds`}
          />
          <div className="num mt-1 flex max-w-[460px] justify-between text-[11px] text-chalk-quiet" aria-hidden>
            {DELAYS.map((d) => <span key={d}>{d / 1000}s</span>)}
          </div>
          <button onClick={() => setSent((n) => n + 1)} disabled={!gap} className="press num mt-8 rounded-md bg-hue px-6 py-4 text-[14px] font-semibold text-slate disabled:opacity-50">
            SEND THE STALE ORDER
          </button>
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2" aria-live="polite">
          {[
            { book: "TV-DELAY BOOK", ok: true, stamp: "FILLED", tone: "text-stamp-blue", note: `paid ${paid.toFixed(3)} for a share worth ${worth.toFixed(3)}: +${(worth - paid).toFixed(3)} a share` },
            { book: "RINGSIDE BOOK", ok: !stale, stamp: stale ? "REJECTED · STALE TICK" : "FILLED · FAIR PRICE", tone: stale ? "text-stamp-red" : "text-stamp-blue", note: stale ? `seen tick ${seen}, book at ${shot}: ${shot - seen} behind, limit ${STALE_TICKS}` : `within ${STALE_TICKS} ticks: you pay the fresh price ${worth.toFixed(3)}, no edge` },
          ].map((b) => (
            <div key={b.book} className="ticket relative min-h-[230px] rounded-2xl p-5">
              <p className="num text-[11px] text-ink-quiet">{b.book}</p>
              <p className="num mt-1 text-[14px] text-ink">BUY RED × 3 @ {paid.toFixed(3)}</p>
              <p className="num text-[12px] text-ink-quiet">seen tick {seen}</p>
              <div className="perf my-4 h-2" />
              {sent > 0 ? (
                <>
                  <span key={`${sent}-${b.book}`} className={`stamp-lg text-[15px] ${b.tone}`} style={{ animation: "stamp 280ms var(--ease-snap)" }}>{b.stamp}</span>
                  <p className="num mt-4 text-[12px] text-ink-quiet">{b.note}</p>
                </>
              ) : (
                <p className="num text-[12px] text-ink-quiet">waiting for your order</p>
              )}
            </div>
          ))}
          <div className="rounded-2xl border border-rule p-5 sm:col-span-2">
            <p className="num text-[11px] text-chalk-quiet">MEASURED ON DEVNET AT {(delay / 1000).toFixed(1)} S · E1</p>
            {measured ? (
              <p className="mt-2 text-[16px] leading-relaxed">
                Over {measured.n_matches} matches the courtsider made <b className="text-hue">{measured.pnl_mean >= 0 ? "+" : ""}{measured.pnl_mean.toFixed(2)}</b> per match on the delayed book ({measured.stale_fills_accepted} stale fills).
                On Ringside none of its stale orders filled.
              </p>
            ) : (
              <p className="mt-2 text-chalk-quiet">No devnet run at this delay yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
