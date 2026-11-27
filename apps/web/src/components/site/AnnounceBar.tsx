"use client";
// Bell-yellow marquee: real numbers only (results.json), never a fake activity counter.
import { useResults, fmt } from "@/lib/home-data";

export function AnnounceBar() {
  const { data: r } = useResults();
  const items: string[] = ["NEW · Ringside for AI agents: npx -y ringside-mcp", "Live on Solana devnet inside a MagicBlock private ephemeral rollup"];
  if (r?.e1?.ringside) items.push(`${fmt(r.e1.ringside.stale_rejections)} stale orders rejected onchain, ${r.e1.ringside.stale_fills_accepted} filled`);
  if (r?.e3?.tick_cadence_ms) items.push(`One tick every ${Math.round(r.e3.tick_cadence_ms.p50)} ms (p50) over ${fmt(r.e3.tick_cadence_ms.n)} ticks`);
  if (r?.e6) items.push(`${r.e6.verified_wasm}/${r.e6.k} matches replayed in WASM to the same hash chain`);
  items.push("Test-dollars only · no real money");
  const row = (
    <div className="flex shrink-0 items-center">
      {items.map((t) => (
        <span key={t} className="flex items-center gap-3 px-6">
          <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-slate" />
          {t}
        </span>
      ))}
    </div>
  );
  return (
    <div className="num overflow-hidden bg-mint py-[7px] text-[12px] font-medium text-slate" role="note" aria-label={items.join(". ")}>
      <div className="marquee" aria-hidden>
        {row}
        {row}
      </div>
    </div>
  );
}
