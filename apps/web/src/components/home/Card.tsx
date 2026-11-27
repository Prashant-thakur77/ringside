"use client";
// Tonight's card: live and starting bouts with their split-flap prices, then results with replay links.
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Flap } from "@/components/Flap";
import { api, STATUS, useLive, type Book } from "@/lib/live";
import { labelFor } from "@/lib/names";

export interface Row {
  match_key: string; match_id: string; stake: number; status: number; winner: number;
  fighters: [string | null, string | null]; tick: number; books: { live: Book | null; delayed: Book | null } | null;
}
const clock = (tick: number) => {
  const s = Math.floor(tick / 10);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function useCard() {
  const { data: rows, isError } = useQuery({ queryKey: ["matches"], queryFn: () => api<Row[]>("/matches?limit=40"), refetchInterval: 2000 });
  const states = useLive((s) => s.states);
  const all = (rows ?? []).map((r) => {
    const st = states[r.match_key];
    return st ? { ...r, status: st.match.status, tick: st.match.tick, winner: st.match.winner, books: { live: st.live, delayed: st.delayed } } : r;
  });
  const live = all.filter((r) => r.status === 1 || r.status === 2 || (r.status === 0 && Date.now() - Number(r.match_id) < 5 * 60_000));
  const done = all.filter((r) => r.status >= 3).slice(0, 8);
  return { live, done, loading: !rows && !isError, offline: isError };
}

export function Card() {
  const { live, done, loading, offline } = useCard();
  return (
    <section id="card" className="scroll-mt-16 bg-slate px-4 py-24 text-chalk md:px-8" aria-labelledby="card-title">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-chalk pb-3">
          <h2 id="card-title" className="display text-[clamp(48px,7vw,112px)] font-semibold">Tonight&apos;s card</h2>
          <span className="num text-[13px] text-chalk-quiet">{live.length} LIVE OR STARTING · AI FIGHTERS, CLEARLY LABELLED</span>
        </div>
        {loading && <p className="num py-10 text-chalk-quiet">Reading the card from the indexer…</p>}
        {offline && <p className="py-10 text-chalk-quiet">The live indexer is not reachable right now. The story above uses a recorded devnet match, and every replay below still verifies in your browser.</p>}
        {!loading && !offline && live.length === 0 && (
          <p className="py-10 text-[17px] text-chalk-quiet">Between bouts. Start one yourself: <Link href="/fight" className="text-hue underline">fight an AI</Link>, or replay a finished match below.</p>
        )}
        <ul>
          {live.map((r, i) => {
            const b = r.books?.live;
            const p = b ? b.fair_p : 0.5;
            return (
              <li key={r.match_key}>
                <Link href={`/m/${r.match_id}`} className="group grid grid-cols-[2.4rem_1fr_auto] items-center gap-3 border-b border-rule py-5 transition-colors hover:bg-slate-2 md:grid-cols-[3.5rem_1.4fr_1fr_auto_auto] md:gap-6">
                  <span className="num text-chalk-quiet">{String(i + 1).padStart(2, "0")}</span>
                  <span className="display text-[30px] font-semibold md:text-[40px]">
                    <span className="text-red-ink">{labelFor(r.fighters[0])}</span> <span className="text-lg text-chalk-quiet">vs</span> <span className="text-blue-ink">{labelFor(r.fighters[1])}</span>
                  </span>
                  <span className="num hidden text-sm text-chalk-quiet md:block">{STATUS[r.status]} · {clock(r.tick)} · {b?.n_trades ?? 0} fills</span>
                  <span className="hidden md:block"><Flap value={p.toFixed(2)} size={28} tone={p >= 0.5 ? "red" : "blue"} /></span>
                  <span className="num rounded-full bg-hue px-4 py-2 text-[12px] font-semibold text-slate transition-transform group-hover:translate-x-1">WATCH →</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {done.length > 0 && (
          <>
            <h3 className="display mt-16 text-[40px] font-semibold">Results</h3>
            <ul className="mt-3 grid gap-x-10 md:grid-cols-2">
              {done.map((r) => (
                <li key={r.match_key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-4">
                  <span className="display text-[24px] font-semibold">
                    <span className={r.winner === 1 ? "text-red-ink" : "text-chalk-quiet"}>{labelFor(r.fighters[0])}</span>
                    <span className="mx-2 text-base text-chalk-quiet">vs</span>
                    <span className={r.winner === 2 ? "text-blue-ink" : "text-chalk-quiet"}>{labelFor(r.fighters[1])}</span>
                  </span>
                  <span className="flex items-baseline gap-4">
                    <span className="num text-[12px] text-chalk-quiet">#{String(r.match_id).slice(-4)} · {r.winner === 3 ? "DRAW" : `${r.winner === 1 ? "RED" : "BLUE"} · T${r.tick}`}</span>
                    <Link href={`/replay/${r.match_id}`} className="num text-sm text-hue hover:underline">Replay + verify →</Link>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
