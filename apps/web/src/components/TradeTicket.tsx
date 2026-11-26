"use client";
// The trade ticket: onboarding in four plain steps, then Buy Red / Buy Blue / Sell with the tick
// each order was priced on, the fill tick and latency. Results are printed as stamped tickets.
import { useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { Book } from "@/lib/live";
import { price } from "@/lib/live";
import { useTrader, type TradeResult } from "@/lib/trader";
import { explorerTx, MINT_LABEL } from "@/lib/config";

const REASONS: Record<number, string> = { 6000: "STALE TICK", 6001: "FIGHTER BARRED", 6002: "SLIPPAGE", 6003: "EXPOSURE CAP", 6004: "CLOSED", 6012: "FROZEN" };

export function TradeTicket({ matchId, book, mode = 0, closed }: { matchId: bigint; book: Book | null; mode?: number; closed: boolean }) {
  const t = useTrader();
  const { setVisible } = useWalletModal();
  const [qty, setQty] = useState(5);
  const [last, setLast] = useState<TradeResult | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const go = async (side: "A" | "B", dir: "buy" | "sell") => {
    if (!book) return;
    setSending(`${dir}${side}`);
    const px = BigInt(dir === "buy" ? (side === "A" ? book.ask_a : book.ask_b) : side === "A" ? book.bid_a : book.bid_b);
    const limit = dir === "buy" ? px + 10_000n : px - 10_000n > 0n ? px - 10_000n : 0n;
    const r = await t.trade(matchId, mode, BigInt(book.last_priced_tick), side, dir, BigInt(qty), limit);
    setLast({ ...r, price: px });
    setSending(null);
  };

  const steps: [string, string][] = [
    ["connect", "Connect a wallet"],
    ["pass", "Sign a TEE pass (no fee)"],
    ["fund", `Fund 20 ${MINT_LABEL} and join this book`],
    ["session", "Start a 2-hour session"],
  ];
  const order = ["connect", "pass", "fund", "session", "ready"];
  const at = order.indexOf(t.step);

  return (
    <section className="rounded border border-rule bg-slate-2 p-4" aria-label="Trade">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="display text-2xl font-extrabold">Trade</h2>
        <span className="label">TICK {book ? String(book.last_priced_tick).padStart(6, "0") : "——"}</span>
      </div>
      {t.step !== "ready" ? (
        <ol className="space-y-2">
          {steps.map(([k, label], i) => (
            <li key={k} className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm ${i === at ? "border-brass" : "border-rule"} ${i < at ? "opacity-50" : ""}`}>
              <span><span className="num mr-2 text-chalk-quiet">{i + 1}</span>{label}</span>
              {i === at && (
                <button
                  className="num rounded bg-chalk px-3 py-1.5 text-[13px] font-semibold text-slate disabled:opacity-50"
                  disabled={!!t.busy}
                  onClick={() =>
                    k === "connect" ? setVisible(true) : k === "pass" ? t.getPass() : k === "fund" ? t.fundAndJoin(matchId, 20_000_000n, mode) : t.startSession(50_000_000n)
                  }
                >
                  {t.busy ?? (k === "connect" ? "Connect" : "Go")}
                </button>
              )}
            </li>
          ))}
          {t.error && <li className="text-sm text-red-ink">{t.error}</li>}
        </ol>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="label">QTY</span>
            {[1, 5, 10, 25].map((q) => (
              <button key={q} onClick={() => setQty(q)} className={`num min-w-11 rounded border px-2 py-1.5 text-sm ${qty === q ? "border-chalk text-chalk" : "border-rule text-chalk-quiet"}`} aria-pressed={qty === q}>
                {q}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={closed || !!sending} onClick={() => go("A", "buy")} className="num min-h-12 rounded bg-red px-3 py-3 text-left font-semibold text-white active:scale-[.97] disabled:opacity-40">
              BUY RED <span className="float-right">{book ? price(book.ask_a) : "—"}</span>
            </button>
            <button disabled={closed || !!sending} onClick={() => go("B", "buy")} className="num min-h-12 rounded bg-blue px-3 py-3 text-left font-semibold text-white active:scale-[.97] disabled:opacity-40">
              BUY BLUE <span className="float-right">{book ? price(book.ask_b) : "—"}</span>
            </button>
            <button disabled={closed || !!sending} onClick={() => go("A", "sell")} className="num rounded border border-rule px-3 py-2 text-left text-sm text-red-ink disabled:opacity-40">
              SELL RED <span className="float-right">{book ? price(book.bid_a) : "—"}</span>
            </button>
            <button disabled={closed || !!sending} onClick={() => go("B", "sell")} className="num rounded border border-rule px-3 py-2 text-left text-sm text-blue-ink disabled:opacity-40">
              SELL BLUE <span className="float-right">{book ? price(book.bid_b) : "—"}</span>
            </button>
          </div>
          <p className="text-xs text-chalk-quiet">Each order is stamped with the tick it was priced on. If the fight has moved more than 2 ticks by the time it lands, the book rejects it onchain.</p>
        </div>
      )}
      {last && (
        <div key={last.sig ?? last.ms} className="ticket relative mt-4 rounded-sm p-3 text-sm">
          <div className="num flex justify-between text-[12px] text-ink-quiet">
            <span>SEEN TICK {String(last.seenTick).padStart(6, "0")}</span>
            <span>{Math.round(last.ms)} ms</span>
          </div>
          <div className="num mt-1 text-[15px]">
            {last.qty.toString()} × {last.side === "A" ? "RED" : "BLUE"} @ {last.price ? price(Number(last.price)) : "—"}
          </div>
          <div className="mt-2 flex items-center justify-between">
            {last.sig ? <a className="num text-[12px] underline" href={explorerTx(last.sig, true)} target="_blank" rel="noreferrer">tx ↗</a> : <span />}
            <span className="stamp text-[13px]" style={{ color: last.ok ? "var(--color-stamp-blue)" : "var(--color-stamp-red)" }}>
              {last.ok ? "FILLED" : `REJECTED · ${REASONS[last.code ?? 0] ?? last.code ?? "ERROR"}`}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
