"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Arena } from "@/components/Arena";
import { Flap } from "@/components/Flap";
import { JudgePanel } from "@/components/JudgePanel";
import { OddsChart, type OddsPoint } from "@/components/OddsChart";
import { TradeTicket } from "@/components/TradeTicket";
import { api, price, STATUS, useLive, type LiveState } from "@/lib/live";
import { labelFor } from "@/lib/names";
import { loadSim, hexToBytes, type StateView } from "@/lib/wasm";
import { SITE_URL } from "@/lib/config";

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const matchId = useMemo(() => BigInt(id), [id]);
  const [snap, setSnap] = useState<(LiveState & { match_key: string }) | null>(null);
  const [view, setView] = useState<StateView | null>(null);
  const [judge, setJudge] = useState(false);
  const [points, setPoints] = useState<OddsPoint[]>([]);
  const lastTick = useRef(-1);

  useEffect(() => {
    api<LiveState & { match_key: string }>(`/matches/${id}/state`).then(setSnap).catch(() => {});
    if (new URLSearchParams(window.location.search).get("judge") === "1") setJudge(true);
  }, [id]);
  const streamed = useLive((s) => (snap ? s.states[snap.match_key] : undefined));
  const st = streamed ?? snap;

  useEffect(() => {
    if (!st?.match) return;
    if (st.match.tick !== lastTick.current && st.live) {
      lastTick.current = st.match.tick;
      setPoints((p) => [...p.slice(-600), { tick: st.match.tick, live: st.live!.fair_p, delayed: st.delayed?.fair_p }]);
    }
    loadSim().then((sim) => setView(JSON.parse(sim.stateJson(hexToBytes(st.match.sim_hex)))));
  }, [st]);

  const m = st?.match;
  const live = st?.live ?? null;
  const closed = !m || m.status >= 3;
  const secs = Math.floor((m?.tick ?? 0) / 10);
  const hp = view ? [Math.max(0, view.fighters[0].hp), Math.max(0, view.fighters[1].hp)] : [100, 100];

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 md:px-7">
      <div className="flex flex-wrap items-center gap-3 py-4">
        <Link href="/" className="label hover:text-chalk">← LOBBY</Link>
        <span className="label">MATCH {id}</span>
        <span className={`num ml-auto text-sm ${m && m.status <= 2 ? "text-red-ink" : "text-chalk-quiet"}`}>{m ? STATUS[m.status] : "Loading"}</span>
        <button onClick={() => setJudge((j) => !j)} aria-pressed={judge} className={`num rounded border px-3 py-1.5 text-[13px] ${judge ? "border-brass text-brass" : "border-rule text-chalk-quiet"}`}>
          Judge mode {judge ? "on" : "off"}
        </button>
      </div>

      {/* scorebug: corner, HP, clock */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded border border-rule bg-slate-2 px-3 py-2">
        <div>
          <div className="display text-2xl font-extrabold text-red-ink md:text-3xl">{labelFor(m?.fighters[0])}</div>
          <div className="mt-1 h-2 rounded bg-slate-3"><div className="h-2 rounded bg-red transition-[width] duration-150" style={{ width: `${hp[0]}%` }} /></div>
        </div>
        <div className="num text-center">
          <div className="text-xl md:text-2xl">{String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</div>
          <div className="label">TICK {String(m?.tick ?? 0).padStart(6, "0")}</div>
        </div>
        <div className="text-right">
          <div className="display text-2xl font-extrabold text-blue-ink md:text-3xl">{labelFor(m?.fighters[1])}</div>
          <div className="mt-1 h-2 rounded bg-slate-3"><div className="ml-auto h-2 rounded bg-blue transition-[width] duration-150" style={{ width: `${hp[1]}%` }} /></div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="overflow-hidden rounded border border-rule">
            <Arena simHex={m?.sim_hex} className="w-full" />
          </div>
          <div className="mt-3 rounded border border-rule bg-slate-2 p-3">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="label">P(RED WINS) · LAST 30 S{judge ? " · DASHED: TV-DELAY BOOK" : ""}</span>
              <span className="num text-sm">{live ? `${Math.round(live.fair_p * 100)}%` : "—"}</span>
            </div>
            <OddsChart points={points} showDelayed={judge} />
          </div>
        </div>
        <div className="space-y-4">
          <section className="rounded border border-rule bg-slate-2 p-4" aria-label="Prices">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="label text-red-ink">RED · ASK / BID</p>
                <Flap value={live ? price(live.ask_a) : "-.---"} size={34} tone="red" />
                <p className="num mt-1 text-sm text-chalk-quiet">bid {live ? price(live.bid_a) : "—"}</p>
              </div>
              <div>
                <p className="label text-blue-ink">BLUE · ASK / BID</p>
                <Flap value={live ? price(live.ask_b) : "-.---"} size={34} tone="blue" />
                <p className="num mt-1 text-sm text-chalk-quiet">bid {live ? price(live.bid_b) : "—"}</p>
              </div>
            </div>
            <p className="num mt-3 text-[12px] text-chalk-quiet">
              priced on tick {live?.last_priced_tick ?? "—"} · spread {live ? price(live.spread) : "—"} · vol {live ? (live.volume / 1e6).toFixed(2) : "0"} · {live?.n_trades ?? 0} fills · {live?.n_rejected_stale ?? 0} stale rejected
              {live && live.frozen_until_tick > live.last_priced_tick ? " · FROZEN (lethal-range hit)" : ""}
            </p>
            {m && m.status >= 3 && (
              <div className="bell mt-3 border-t-2 border-brass pt-2">
                <p className="display text-2xl font-extrabold text-brass">{m.winner === 1 ? "Red wins" : m.winner === 2 ? "Blue wins" : m.winner === 3 ? "Draw" : "Bell"}</p>
                <Link href={`/replay/${id}`} className="num text-sm underline">Replay and verify the hash chain →</Link>
              </div>
            )}
          </section>
          <TradeTicket matchId={matchId} book={live} closed={closed} />
          <section className="hidden rounded border border-rule bg-slate-2 p-4 md:flex md:items-center md:gap-4" aria-label="Trade from your phone">
            <div className="rounded bg-chalk p-2"><QRCodeSVG value={`${SITE_URL}/m/${id}`} size={96} bgColor="#ecebe4" fgColor="#171b19" /></div>
            <p className="text-sm text-chalk-quiet">Scan to watch and trade this match on your phone. One wallet prompt, then gasless.</p>
          </section>
        </div>
      </div>
      {judge && <JudgePanel matchId={id} live={live} delayed={st?.delayed ?? null} gameTick={m?.tick ?? 0} />}
    </div>
  );
}
