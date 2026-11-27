"use client";
// Judge mode: the same match priced two ways. Left, the TV-delay book (same pricing code, fed
// late by a relay). Right, the Ringside book (priced in the instruction that advances the fight).
// A visible courtsider fires the same stale quote at both.
import { useQuery } from "@tanstack/react-query";
import { Flap } from "./Flap";
import { api, useLive, type Book, type FeedEvent } from "@/lib/live";
import { explorerTx, isTx } from "@/lib/config";

interface JudgeCounts { fills: number; stale_fills_accepted: number; stale_rejections: number; reject_sig: string | null }
const COURTSIDER = process.env.NEXT_PUBLIC_COURTSIDER ?? "";

function Board({ title, sub, book, gameTick, counts, tone, events }: { title: string; sub: string; book: Book | null; gameTick: number; counts?: JudgeCounts; tone: "tv" | "ring"; events: FeedEvent[] }) {
  const lag = book ? Math.max(0, gameTick - book.last_priced_tick) : 0;
  return (
    <div className={`rounded border p-4 ${tone === "tv" ? "border-brass/50" : "border-rule"} bg-slate-2`}>
      <div className="flex items-baseline justify-between">
        <h3 className="display text-2xl font-extrabold">{title}</h3>
        <span className="label">{sub}</span>
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div>
          <p className="label">RED ASK</p>
          <Flap value={book ? (book.ask_a / 1e6).toFixed(3) : "-.---"} size={30} tone="red" />
        </div>
        <div>
          <p className="label">BLUE ASK</p>
          <Flap value={book ? (book.ask_b / 1e6).toFixed(3) : "-.---"} size={30} tone="blue" />
        </div>
      </div>
      <p className="num mt-3 text-[13px]">
        priced on tick <b>{book?.last_priced_tick ?? "—"}</b> · fight at tick <b>{gameTick}</b> ·{" "}
        <span className={lag > 2 ? "text-brass" : "text-chalk-quiet"}>{lag} ticks behind ({lag * 100} ms)</span>
      </p>
      <dl className="num mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded bg-slate-3 p-2"><dt className="label">FILLS</dt><dd className="text-2xl">{counts?.fills ?? 0}</dd></div>
        <div className="rounded bg-slate-3 p-2"><dt className="label">STALE FILLS</dt><dd className={`text-2xl ${counts?.stale_fills_accepted ? "text-brass" : ""}`}>{counts?.stale_fills_accepted ?? 0}</dd></div>
        <div className="rounded bg-slate-3 p-2"><dt className="label">STALE REJECTED</dt><dd className="text-2xl">{counts?.stale_rejections ?? 0}</dd></div>
      </dl>
      <ul className="mt-3 space-y-1.5">
        {events.slice(-4).reverse().map((e, i) => (
          <li key={i} className="ticket flex items-center justify-between rounded-sm px-2.5 py-1.5 text-[12px]">
            <span className="num">seen {String(e.seen_tick)} {e.game_tick != null ? `· fight ${String(e.game_tick)}` : ""}</span>
            {isTx(e.signature as string) ? <a className="num underline" href={explorerTx(String(e.signature), true)} target="_blank" rel="noreferrer">tx</a> : null}
            <span className="stamp text-[11px]" style={{ color: e.type === "trade" ? "var(--color-stamp-blue)" : "var(--color-stamp-red)" }}>
              {e.type === "trade" ? "FILLED" : "REJECTED · STALE"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JudgePanel({ matchId, live, delayed, gameTick }: { matchId: string; live: Book | null; delayed: Book | null; gameTick: number }) {
  const { data } = useQuery({ queryKey: ["judge", matchId], queryFn: () => api<{ ringside: JudgeCounts; tv_delay: JudgeCounts }>(`/judge/${matchId}`), refetchInterval: 1000 });
  const events = useLive((s) => s.events);
  const mine = events.filter((e) => (!COURTSIDER || e.trader === COURTSIDER) && (e.type === "trade" || e.type === "reject"));
  return (
    <section aria-labelledby="judge" className="mt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="judge" className="display text-3xl font-extrabold">Judge mode · the courtsider A/B</h2>
        <p className="text-sm text-chalk-quiet">Same bot, same match, same pricing code. Only the feed differs.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Board title="TV-delay book" sub={`feed ${delayed ? delayed.delay_ms : "—"} ms late`} book={delayed} gameTick={gameTick} counts={data?.tv_delay} tone="tv" events={mine.filter((e) => Number(e.mode) === 1)} />
        <Board title="Ringside book" sub="priced in the tick" book={live} gameTick={gameTick} counts={data?.ringside} tone="ring" events={mine.filter((e) => Number(e.mode) === 0)} />
      </div>
      {isTx(data?.ringside?.reject_sig) && (
        <p className="num mt-3 text-[13px] text-chalk-quiet">
          A stale order rejected onchain: <a className="text-brass underline" href={explorerTx(data.ringside.reject_sig, true)} target="_blank" rel="noreferrer">{data.ringside.reject_sig.slice(0, 16)}…</a>
        </p>
      )}
    </section>
  );
}
