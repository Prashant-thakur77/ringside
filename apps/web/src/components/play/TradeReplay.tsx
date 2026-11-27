"use client";
// Trade a replayed devnet fight: the real tick-by-tick fair price from a finished match, played back at fight speed.
// Every fill happens at the price of the tick you are on, the same rule the program enforces on the live book.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/live";
import { OddsChart, type OddsPoint } from "@/components/OddsChart";
import { labelFor } from "@/lib/names";

type Row = { match_id: string; status: number; winner: number; tick: number; fighters: [string | null, string | null] };
type Tick = { tick: number; fair_p: number; flags: number };
type Fill = { tick: number; side: "RED" | "BLUE"; qty: number; px: number; kind: "BUY" | "SELL" };

const SPREAD = 0.01;
const LOT = 10;
const BANK = 100;
const money = (v: number) => `${v >= 0 ? "" : "−"}$${Math.abs(v).toFixed(2)}`;

export function TradeReplay() {
  const [rows, setRows] = useState<Row[]>([]);
  const [pick, setPick] = useState(0);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [cash, setCash] = useState(BANK);
  const [red, setRed] = useState(0);
  const [blue, setBlue] = useState(0);
  const [fills, setFills] = useState<Fill[]>([]);
  const [best, setBest] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api<Row[]>("/matches?limit=40").then((r) => setRows(r.filter((m) => m.status >= 3 && m.tick >= 150))).catch(() => {});
    const b = localStorage.getItem("ringside-best");
    if (b) setBest(Number(b));
  }, []);

  const match = rows.length ? rows[pick % rows.length] : null;

  const reset = useCallback(() => {
    setI(0); setPlaying(false); setCash(BANK); setRed(0); setBlue(0); setFills([]);
  }, []);

  useEffect(() => {
    if (!match) return;
    reset();
    setTicks([]);
    api<{ ticks: Tick[] }>(`/matches/${match.match_id}/replay`).then((r) => setTicks(r.ticks)).catch(() => {});
  }, [match, reset]);

  const over = ticks.length > 0 && i >= ticks.length - 1;
  useEffect(() => {
    if (!playing || over) return;
    timer.current = setInterval(() => setI((x) => Math.min(x + 1, ticks.length - 1)), 100 / speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, over, ticks.length]);

  const t = ticks[i];
  const p = t?.fair_p ?? 0.5;
  const askRed = Math.min(0.99, p + SPREAD), askBlue = Math.min(0.99, 1 - p + SPREAD);
  const bidRed = Math.max(0.01, p - SPREAD), bidBlue = Math.max(0.01, 1 - p - SPREAD);

  // at the bell shares pay 1 for the winner, 0 for the loser, 0.5 each on a draw
  const payRed = match?.winner === 1 ? 1 : match?.winner === 3 ? 0.5 : 0;
  const payBlue = match?.winner === 2 ? 1 : match?.winner === 3 ? 0.5 : 0;
  const value = over ? cash + red * payRed + blue * payBlue : cash + red * bidRed + blue * bidBlue;
  const pnl = value - BANK;

  useEffect(() => {
    if (!over || fills.length === 0) return;
    setPlaying(false);
    if (best === null || pnl > best) {
      setBest(pnl);
      localStorage.setItem("ringside-best", String(pnl));
    }
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  const trade = (kind: "BUY" | "SELL", side: "RED" | "BLUE") => {
    if (!t || over || !playing) return;
    if (kind === "BUY") {
      const px = side === "RED" ? askRed : askBlue;
      const qty = Math.min(LOT, Math.floor((cash / px) * 100) / 100);
      if (qty <= 0) return;
      setCash((c) => c - qty * px);
      side === "RED" ? setRed((x) => x + qty) : setBlue((x) => x + qty);
      setFills((f) => [{ tick: t.tick, side, qty, px, kind }, ...f].slice(0, 30));
    } else {
      const held = side === "RED" ? red : blue;
      if (held <= 0) return;
      const px = side === "RED" ? bidRed : bidBlue;
      setCash((c) => c + held * px);
      side === "RED" ? setRed(0) : setBlue(0);
      setFills((f) => [{ tick: t.tick, side, qty: held, px, kind }, ...f].slice(0, 30));
    }
  };

  // keyboard: R / B buy, Shift+R / Shift+B sell, space play/pause
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === " ") { e.preventDefault(); setPlaying((x) => !x); }
      if (e.key === "r") trade("BUY", "RED");
      if (e.key === "b") trade("BUY", "BLUE");
      if (e.key === "R") trade("SELL", "RED");
      if (e.key === "B") trade("SELL", "BLUE");
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const points: OddsPoint[] = useMemo(() => ticks.slice(0, i + 1).map((k) => ({ tick: k.tick, live: k.fair_p, hit: k.flags !== 0 })), [ticks, i]);
  const clock = t ? `${String(Math.floor(t.tick / 600)).padStart(2, "0")}:${String(Math.floor(t.tick / 10) % 60).padStart(2, "0")}` : "00:00";

  if (!rows.length) return <p className="num py-10 text-chalk-quiet">Loading finished devnet matches…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="rounded-2xl border border-rule bg-slate-2 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="display text-[26px] font-semibold">
            <span className="text-red-ink">{labelFor(match?.fighters[0])}</span> <span className="text-base text-chalk-quiet">vs</span> <span className="text-blue-ink">{labelFor(match?.fighters[1])}</span>
          </p>
          <p className="num text-[13px] text-chalk-quiet">MATCH #{String(match?.match_id).slice(-4)} · {clock} · TICK {String(t?.tick ?? 0).padStart(4, "0")} / {ticks.length}</p>
        </div>
        <div className="mt-4">{ticks.length ? <OddsChart points={points} height={260} window={600} /> : <div className="h-[260px]" />}</div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate p-4">
            <p className="num text-[12px] text-chalk-quiet">RED TO WIN</p>
            <p className="num text-[40px] font-semibold text-red-ink">{p.toFixed(3)}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => trade("BUY", "RED")} disabled={!playing || over} className="press num flex-1 rounded-lg bg-red px-3 py-3 text-[13px] font-semibold text-chalk disabled:opacity-40">BUY {askRed.toFixed(2)}</button>
              <button onClick={() => trade("SELL", "RED")} disabled={!playing || over || red <= 0} className="press num rounded-lg border border-rule px-3 py-3 text-[13px] disabled:opacity-40">SELL {bidRed.toFixed(2)}</button>
            </div>
          </div>
          <div className="rounded-xl bg-slate p-4">
            <p className="num text-[12px] text-chalk-quiet">BLUE TO WIN</p>
            <p className="num text-[40px] font-semibold text-blue-ink">{(1 - p).toFixed(3)}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => trade("BUY", "BLUE")} disabled={!playing || over} className="press num flex-1 rounded-lg bg-blue px-3 py-3 text-[13px] font-semibold text-chalk disabled:opacity-40">BUY {askBlue.toFixed(2)}</button>
              <button onClick={() => trade("SELL", "BLUE")} disabled={!playing || over || blue <= 0} className="press num rounded-lg border border-rule px-3 py-3 text-[13px] disabled:opacity-40">SELL {bidBlue.toFixed(2)}</button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={() => (over ? reset() : setPlaying((x) => !x))} className="press num rounded-full bg-hue px-6 py-3 text-[13px] font-semibold text-slate">
            {over ? "PLAY AGAIN" : playing ? "PAUSE" : i === 0 ? "RING THE BELL" : "RESUME"}
          </button>
          <div className="num flex overflow-hidden rounded-full border border-rule text-[12px]">
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} aria-pressed={speed === s} className={`px-4 py-2 ${speed === s ? "bg-chalk text-slate" : ""}`}>{s}×</button>
            ))}
          </div>
          <button onClick={() => setPick((x) => x + 1)} className="press num rounded-full border border-rule px-4 py-2 text-[12px]">NEXT FIGHT →</button>
          <span className="num text-[12px] text-chalk-quiet">Keys: space · r / b buy · R / B sell</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className={`rounded-2xl p-5 ${over ? "bg-hue text-slate" : "bg-slate-2"}`}>
          <p className="num text-[12px] opacity-70">{over ? "AT THE BELL" : "YOUR BOOK"}</p>
          <p className="num mt-1 text-[48px] font-semibold">{money(pnl)}</p>
          <p className="num text-[13px] opacity-80">cash {money(cash)} · red {red.toFixed(1)} · blue {blue.toFixed(1)}</p>
          {over && (
            <p className="mt-3 text-[16px]">
              {match?.winner === 3 ? "Draw: every share paid 0.50." : `${match?.winner === 1 ? "Red" : "Blue"} won: each ${match?.winner === 1 ? "red" : "blue"} share paid $1.`}{" "}
              <Link href={`/replay/${match?.match_id}`} className="underline">Replay and verify this match →</Link>
            </p>
          )}
          {best !== null && <p className="num mt-3 text-[12px] opacity-70">YOUR BEST · {money(best)}</p>}
        </div>
        <div className="rounded-2xl border border-rule p-5">
          <p className="num text-[12px] text-chalk-quiet">FILLS · EVERY ONE AT THE TICK YOU WERE ON</p>
          <ul className="num mt-3 max-h-[300px] space-y-1 overflow-auto text-[13px]">
            {fills.length === 0 && <li className="text-chalk-quiet">Ring the bell, then buy the fighter you think the price is wrong about.</li>}
            {fills.map((f, k) => (
              <li key={k} className="flex justify-between gap-3 border-b border-rule/60 py-1">
                <span className={f.side === "RED" ? "text-red-ink" : "text-blue-ink"}>{f.kind} {f.side} {f.qty.toFixed(1)}</span>
                <span>@ {f.px.toFixed(3)}</span>
                <span className="text-chalk-quiet">T{f.tick} · FRESH</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
