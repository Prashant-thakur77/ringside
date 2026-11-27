"use client";
// Deterministic replay: re-simulate the match in the browser (the same Rust sim, compiled to WASM)
// from its inputs and VRF seeds, recompute the state-hash chain and compare every link with the
// hash the program wrote onchain.
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Arena } from "@/components/Arena";
import { OddsChart } from "@/components/OddsChart";
import { api } from "@/lib/live";
import { bytesToHex, hexToBytes, loadSim } from "@/lib/wasm";
import { explorerTx, isTx } from "@/lib/config";

interface ReplayData {
  match_key: string;
  match_id: string;
  tick_ms: number;
  complete: boolean;
  ticks: { tick: number; inputs: [number, number]; hash: string; sig: string | null; fair_p: number; flags: number }[];
  seeds: { wave: number; apply_at_tick: number; seed: string; sig: string | null }[];
  trades: { sig: string; mode: number; tick: number; seen_tick: number; price: number; qty: number; side: number; dir: number }[];
}

type Verdict = { ok: boolean; checked: number; firstMismatch?: number };

export default function Replay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ReplayData | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ReplayData>(`/matches/${id}/replay`).then(setData).catch((e) => setError(String(e)));
  }, [id]);

  // Re-simulate every tick (state bytes kept for scrubbing).
  useEffect(() => {
    if (!data?.ticks.length) return;
    loadSim().then((sim) => {
      let s = sim.newState(data.tick_ms, new Uint8Array(32));
      const out = [bytesToHex(s)];
      let si = 0;
      for (const t of data.ticks) {
        while (si < data.seeds.length && data.seeds[si].apply_at_tick <= t.tick) {
          s.set(hexToBytes(data.seeds[si].seed), 20);
          si++;
        }
        const r = sim.step(s, t.inputs[0], t.inputs[1]);
        s = r.slice(0, sim.simBytes());
        out.push(bytesToHex(s));
      }
      setStates(out);
      setAt(out.length - 1);
    });
  }, [data]);

  const verify = async () => {
    if (!data) return;
    setBusy(true);
    const sim = await loadSim();
    const inputs = Uint16Array.from(data.ticks.flatMap((t) => t.inputs));
    const seeds = new Uint8Array(data.seeds.length * 36);
    data.seeds.forEach((s, i) => {
      new DataView(seeds.buffer).setUint32(i * 36, s.apply_at_tick, true);
      seeds.set(hexToBytes(s.seed), i * 36 + 4);
    });
    const chain = sim.replay(sim.newState(data.tick_ms, new Uint8Array(32)), inputs, seeds);
    let firstMismatch: number | undefined;
    for (let i = 0; i < data.ticks.length; i++) {
      if (bytesToHex(chain.subarray(i * 32, i * 32 + 32)) !== data.ticks[i].hash) {
        firstMismatch = data.ticks[i].tick;
        break;
      }
    }
    setVerdict({ ok: firstMismatch === undefined && data.complete, checked: data.ticks.length, firstMismatch });
    setBusy(false);
  };

  const points = useMemo(() => (data?.ticks ?? []).map((t) => ({ tick: t.tick, live: t.fair_p })), [data]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-24 md:px-7">
      <div className="flex items-center gap-3 py-4">
        <Link href={`/m/${id}`} className="label hover:text-chalk">← MATCH {id}</Link>
      </div>
      <h1 className="display text-[clamp(40px,6vw,88px)] font-semibold">Replay &amp; verify</h1>
      <p className="mt-3 max-w-[60ch] text-chalk-quiet">
        Your browser re-runs the fight from its inputs and VRF seeds with the same Rust simulation the program runs, then recomputes the state-hash chain and compares every link with the hash written onchain.
      </p>
      {error && <p className="mt-4 text-red-ink">{error}</p>}
      {data && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="overflow-hidden rounded border border-rule">
              <Arena simHex={states[at]} />
            </div>
            <label className="mt-3 block">
              <span className="label">SCRUB · TICK {at} / {Math.max(0, states.length - 1)}</span>
              <input type="range" min={0} max={Math.max(0, states.length - 1)} value={at} onChange={(e) => setAt(Number(e.target.value))} className="mt-2 w-full accent-[#c9a24a]" />
            </label>
            <div className="mt-3 rounded border border-rule bg-slate-2 p-3">
              <p className="label mb-1">P(RED WINS) BY TICK</p>
              <OddsChart points={points} />
            </div>
          </div>
          <div className="space-y-4">
            <section className="ticket rounded-sm p-4">
              <p className="num text-[12px] text-ink-quiet">{data.ticks.length} TICKS · {data.seeds.length} VRF SEEDS · {data.trades.length} FILLS</p>
              <button onClick={verify} disabled={busy || !data.ticks.length} className="num mt-3 w-full rounded bg-ink px-4 py-3 font-semibold text-ticket disabled:opacity-50">
                {busy ? "Recomputing…" : "Verify the hash chain"}
              </button>
              {verdict && (
                <div className="mt-4 text-center">
                  <span className="stamp text-xl" style={{ color: verdict.ok ? "var(--color-stamp-blue)" : "var(--color-stamp-red)" }}>
                    {verdict.ok ? `VERIFIED ✓ ${verdict.checked} TICKS` : verdict.firstMismatch ? `MISMATCH AT TICK ${verdict.firstMismatch}` : "INCOMPLETE DATA"}
                  </span>
                </div>
              )}
            </section>
            <section className="rounded border border-rule bg-slate-2 p-4 text-sm">
              <p className="label mb-2">ONCHAIN</p>
              <ul className="num space-y-1 text-[13px]">
                {data.seeds.map((s) => (
                  <li key={s.wave}>VRF wave {s.wave} → tick {s.apply_at_tick} {s.sig && <a className="text-brass underline" href={explorerTx(s.sig, true)} target="_blank" rel="noreferrer">tx</a>}</li>
                ))}
                {data.ticks.filter((_, i) => i === 0 || i === data.ticks.length - 1).map((t) => (
                  <li key={t.tick}>tick {t.tick} hash {t.hash.slice(0, 12)}… {t.sig && <a className="text-brass underline" href={explorerTx(t.sig, true)} target="_blank" rel="noreferrer">tx</a>}</li>
                ))}
                {data.trades.slice(0, 6).map((t) => (
                  <li key={t.sig}>{t.mode ? "TV-delay" : "Ringside"} fill · seen {t.seen_tick} · {(t.price / 1e6).toFixed(3)} × {t.qty} {isTx(t.sig) ? <a className="text-brass underline" href={explorerTx(t.sig, true)} target="_blank" rel="noreferrer">tx</a> : <span title="Trader and transaction stay private on the TEE rollup">private</span>}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
