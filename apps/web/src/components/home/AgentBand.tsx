"use client";
// The newest thing on the site: Ringside as an MCP server on npm, one command away for any AI agent.
import { useState } from "react";
import Link from "next/link";
import { MCP_PKG } from "@/lib/nav";

export function AgentBand() {
  const [ok, setOk] = useState(false);
  const cmd = `npx -y ${MCP_PKG}`;
  return (
    <section className="relative overflow-hidden bg-mint px-4 py-16 text-slate md:px-8" aria-labelledby="agent-title">
      <div aria-hidden className="pointer-events-none absolute -left-10 top-0 h-full w-[11%] bg-hue [clip-path:polygon(0_0,70%_0,100%_100%,0_100%)] opacity-90" />
      <div className="relative mx-auto grid max-w-[1400px] items-center gap-10 md:grid-cols-[1fr_1.1fr]">
        <div className="md:pl-[9%]">
          <span className="num inline-block rounded-full bg-slate px-3 py-1 text-[11px] font-semibold tracking-[.14em] text-mint">NEW · ON NPM</span>
          <h2 id="agent-title" className="display mt-4 text-[clamp(44px,6vw,96px)] font-semibold leading-[.95]">Ringside, for agents</h2>
          <p className="mt-4 max-w-[46ch] text-[18px] leading-relaxed">An MCP server that lets any AI agent list matches, read both order books, pull odds by tick and re-run a match to verify its hash chain. No wallet, no key.</p>
        </div>
        <div>
          <button onClick={() => { navigator.clipboard.writeText(cmd); setOk(true); setTimeout(() => setOk(false), 1400); }}
            className="press group flex w-full items-center justify-between gap-4 rounded-2xl bg-slate px-6 py-6 text-left text-chalk">
            <span className="num text-[clamp(18px,2vw,28px)]"><span className="text-hue">$</span> {cmd}</span>
            <span className="num rounded-full bg-hue px-4 py-2 text-[12px] font-semibold text-slate">{ok ? "COPIED" : "COPY"}</span>
          </button>
          <div className="num mt-4 flex flex-wrap gap-2 text-[12px]">
            {["list_matches", "get_match", "get_odds_history", "verify_match", "courtsiding_report", "get_stats", "explain"].map((t) => (
              <span key={t} className="rounded-full border border-slate/30 px-3 py-1">{t}</span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/agents" className="press num rounded-full bg-slate px-5 py-3 text-[13px] font-semibold text-chalk">SET IT UP →</Link>
            <a href={`https://www.npmjs.com/package/${MCP_PKG}`} target="_blank" rel="noreferrer" className="press num rounded-full border-2 border-slate px-5 py-3 text-[13px] font-semibold">NPM ↗</a>
          </div>
        </div>
      </div>
    </section>
  );
}
