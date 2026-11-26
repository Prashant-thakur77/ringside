"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Flap } from "@/components/Flap";
import { api, price, STATUS, useLive, type Book } from "@/lib/live";
import { labelFor } from "@/lib/names";

interface Row {
  match_key: string;
  match_id: string;
  stake: number;
  status: number;
  winner: number;
  fighters: [string | null, string | null];
  tick: number;
  books: { live: Book | null; delayed: Book | null } | null;
}

const clock = (tick: number) => {
  const s = Math.floor(tick / 10);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function Lobby() {
  const { data: rows } = useQuery({ queryKey: ["matches"], queryFn: () => api<Row[]>("/matches?limit=40"), refetchInterval: 2000 });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api<{ tick_cadence_ms?: { p50: number; p95: number; n: number } }>("/stats"), refetchInterval: 10000 });
  const { data: board } = useQuery({ queryKey: ["leaderboard"], queryFn: () => api<{ wallet: string; elo: number; matches: number; wins: number }[]>("/leaderboard"), refetchInterval: 15000 });
  const states = useLive((s) => s.states);
  const all = (rows ?? []).map((r) => {
    const st = states[r.match_key];
    return st ? { ...r, status: st.match.status, tick: st.match.tick, winner: st.match.winner, books: { live: st.live, delayed: st.delayed } } : r;
  });
  // Unjoined challenges expire from the card after 5 minutes (match ids are creation timestamps).
  const live = all.filter((r) => r.status === 1 || r.status === 2 || (r.status === 0 && Date.now() - Number(r.match_id) < 5 * 60_000));
  const done = all.filter((r) => r.status >= 3).slice(0, 12);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 md:px-7">
      <section className="grid gap-8 py-10 md:grid-cols-[1.25fr_1fr] md:py-14">
        <div>
          <p className="label mb-4">SOLANA DEVNET · MAGICBLOCK PRIVATE EPHEMERAL ROLLUP</p>
          <h1 className="display text-[clamp(52px,8vw,128px)] font-black">
            The in-play book that <span className="text-red-ink">can&apos;t</span> be courtsided
          </h1>
          <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-chalk-quiet">
            Ringside is an in-play betting exchange that can&apos;t be courtsided: the fight and the order book live in the same MagicBlock rollup, so every price is as fresh as the last punch.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {live[0] && (
              <Link href={`/m/${live[0].match_id}`} className="num rounded bg-chalk px-5 py-3 font-semibold text-slate">
                Watch the live match →
              </Link>
            )}
            <Link href="/fight" className="num rounded border border-red px-5 py-3 text-red-ink">
              Fight an AI
            </Link>
            <Link href="/proof" className="num rounded border border-rule px-5 py-3 text-chalk">
              See the courtsider A/B
            </Link>
          </div>
        </div>
        <aside className="self-end">
          {live[0]?.books?.live ? (
            <Link href={`/m/${live[0].match_id}`} className="block rounded border border-rule bg-slate-2 p-5 hover:border-chalk-quiet">
              <p className="label"><span className="live-dot text-red-ink">●</span> ON NOW · {clock(live[0].tick)} · TICK {String(live[0].tick).padStart(6, "0")}</p>
              <p className="display mt-3 text-[34px] font-extrabold">
                <span className="text-red-ink">{labelFor(live[0].fighters[0])}</span> <span className="text-lg text-chalk-quiet">vs</span> <span className="text-blue-ink">{labelFor(live[0].fighters[1])}</span>
              </p>
              <div className="mt-4 flex items-end gap-6">
                <div><p className="label">RED</p><Flap value={(live[0].books.live.ask_a / 1e6).toFixed(3)} size={40} tone="red" /></div>
                <div><p className="label">BLUE</p><Flap value={(live[0].books.live.ask_b / 1e6).toFixed(3)} size={40} tone="blue" /></div>
              </div>
              <p className="num mt-4 text-[13px] text-chalk-quiet">Re-priced in the same instruction as every tick. An order more than 2 ticks behind is rejected onchain.</p>
            </Link>
          ) : (
            <div className="rounded border border-rule bg-slate-2 p-5">
              <p className="label">BETWEEN BOUTS</p>
              <p className="mt-3 text-[15px] text-chalk-quiet">The fight advances one tick every 100 ms and the same instruction re-prices the book. Orders more than 2 ticks behind are rejected onchain.</p>
            </div>
          )}
          {stats?.tick_cadence_ms?.p50 != null && (
            <p className="num mt-3 text-[12px] text-chalk-quiet">
              Measured tick cadence p50 {Math.round(stats.tick_cadence_ms.p50)} ms · p95 {Math.round(stats.tick_cadence_ms.p95)} ms over {stats.tick_cadence_ms.n} ticks
            </p>
          )}
        </aside>
      </section>

      <section aria-labelledby="card">
        <div className="mb-3 flex items-end justify-between border-b border-rule pb-2">
          <h2 id="card" className="display text-4xl font-extrabold">Tonight&apos;s card</h2>
          <span className="label">{live.length} LIVE OR STARTING</span>
        </div>
        {live.length === 0 && <p className="py-10 text-chalk-quiet">Between bouts. The next AI match starts within a minute.</p>}
        <ul>
          {live.map((r, i) => {
            const b = r.books?.live;
            const p = b ? b.fair_p : 0.5;
            return (
              <li key={r.match_key}>
                <Link href={`/m/${r.match_id}`} className="grid grid-cols-[2.2rem_1fr_auto] items-center gap-3 border-b border-rule py-4 hover:bg-slate-2 md:grid-cols-[3rem_1.3fr_1fr_auto_auto] md:gap-6">
                  <span className="num text-chalk-quiet">{String(i + 1).padStart(2, "0")}</span>
                  <span className="display text-[28px] font-extrabold md:text-[34px]">
                    <span className="text-red-ink">{labelFor(r.fighters[0])}</span> <span className="text-chalk-quiet text-lg">vs</span> <span className="text-blue-ink">{labelFor(r.fighters[1])}</span>
                  </span>
                  <span className="num hidden text-sm text-chalk-quiet md:block">
                    {STATUS[r.status]} · {clock(r.tick)} · vol {b ? (b.volume / 1e6).toFixed(1) : "0.0"} · {b?.n_trades ?? 0} fills
                  </span>
                  <span className="hidden md:block"><Flap value={(p).toFixed(2)} size={26} tone={p >= 0.5 ? "red" : "blue"} /></span>
                  <span className="num text-sm text-brass">Watch →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-14 grid gap-8 md:grid-cols-[1fr_1.4fr]">
      <div aria-labelledby="board">
        <h2 id="board" className="display mb-3 text-3xl font-extrabold">Leaderboard</h2>
        <ol className="num text-sm">
          {(board ?? []).slice(0, 10).map((p, i) => (
            <li key={p.wallet} className="flex justify-between border-b border-rule py-2">
              <span><span className="text-chalk-quiet">{String(i + 1).padStart(2, "0")}</span> {labelFor(p.wallet)}</span>
              <span>{p.elo} elo · {p.wins}/{p.matches}</span>
            </li>
          ))}
          {!board?.length && <li className="py-2 text-chalk-quiet">No ranked fighters yet.</li>}
        </ol>
      </div>
      <div aria-labelledby="results">
        <h2 id="results" className="display mb-3 text-3xl font-extrabold">Results</h2>
        <ul>
          {done.slice(0, 6).map((r) => (
            <li key={r.match_key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-4">
              <span className="display text-[26px] font-extrabold">
                <span className={r.winner === 1 ? "text-red-ink" : "text-chalk-quiet"}>{labelFor(r.fighters[0])}</span>
                <span className="mx-2 text-base text-chalk-quiet">vs</span>
                <span className={r.winner === 2 ? "text-blue-ink" : "text-chalk-quiet"}>{labelFor(r.fighters[1])}</span>
              </span>
              <span className="flex items-baseline gap-4">
                <span className="num text-[12px] text-chalk-quiet">{r.winner === 3 ? "DRAW" : `${r.winner === 1 ? "RED" : "BLUE"} · T${r.tick}`}</span>
                <Link href={`/replay/${r.match_id}`} className="num text-sm text-brass">Replay + verify →</Link>
              </span>
            </li>
          ))}
        </ul>
      </div>
      </section>
    </div>
  );
}
