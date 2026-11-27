"use client";
// Agents: Ringside as an MCP server, so any AI agent can read matches, odds, replays and the measured results.
import { useState } from "react";
import { PageHead } from "@/components/site/PageHead";
import { MCP_PKG } from "@/lib/nav";

const TOOLS: [string, string][] = [
  ["list_matches", "Live and finished bouts with fighters, status, winner and fill counts."],
  ["get_match", "One match: state plus both books, the live Ringside book and the delayed TV book, in dollars."],
  ["get_odds_history", "P(red wins) by tick from the replay, downsampled for charts and analysis."],
  ["verify_match", "Checks the replay's hash chain and VRF seeds and returns the onchain links."],
  ["courtsiding_report", "Stale orders rejected against stale fills accepted, per match and overall."],
  ["get_stats", "Indexer counts and the measured headline numbers from the evaluation."],
  ["explain", "Short answers on the tick, freshness, privacy, settlement, VRF and architecture."],
];
const PROMPTS = [
  "Which finished Ringside match had the biggest swing in P(red wins), and at what tick?",
  "Verify the latest match and give me the explorer links for its VRF seeds.",
  "How many stale orders did Ringside reject, and how many stale fills did the delayed book accept?",
  "Explain why a courtsider can't profit on Ringside, using the live numbers.",
];

function Code({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="relative">
      <pre className="num overflow-x-auto rounded-xl bg-slate-3 p-5 text-[13px] leading-relaxed text-chalk">{text}</pre>
      <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}
        className="press num absolute right-3 top-3 rounded-full bg-hue px-3 py-1 text-[11px] font-semibold text-slate">{ok ? "COPIED" : "COPY"}</button>
    </div>
  );
}

export default function Agents() {
  const cfg = JSON.stringify({ mcpServers: { ringside: { command: "npx", args: ["-y", MCP_PKG] } } }, null, 2);
  return (
    <>
      <PageHead eyebrow="AGENTS · MODEL CONTEXT PROTOCOL" title="Ringside for agents" lead={<>One command gives any MCP client read access to every match, every tick of odds, every replay and the measured results. No wallet and no API key. Package: <span className="num font-semibold">{MCP_PKG}</span> on npm.</>} />
      <section className="bg-slate px-4 py-20 text-chalk md:px-8">
        <div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-2">
          <div className="space-y-8">
            <div>
              <p className="num text-[12px] text-hue">01 · CLAUDE CODE</p>
              <h2 className="display mb-4 mt-1 text-[40px] font-semibold">Add it in one line</h2>
              <Code text={`claude mcp add ringside -- npx -y ${MCP_PKG}`} />
            </div>
            <div>
              <p className="num text-[12px] text-hue">02 · CLAUDE DESKTOP, CURSOR, ANY MCP CLIENT</p>
              <h2 className="display mb-4 mt-1 text-[40px] font-semibold">Or drop in the config</h2>
              <Code text={cfg} />
              <p className="mt-3 text-[15px] text-chalk-quiet">Set <span className="num">RINGSIDE_INDEXER_URL</span> to point at your own indexer. Without it the server reads the live site, and falls back to the recorded devnet matches.</p>
            </div>
            <div>
              <p className="num text-[12px] text-hue">03 · ASK</p>
              <ul className="mt-3 space-y-3">
                {PROMPTS.map((p) => <li key={p} className="serif rounded-xl border border-rule p-4 text-[20px] leading-snug">“{p}”</li>)}
              </ul>
            </div>
          </div>
          <div>
            <p className="num text-[12px] text-hue">TOOLS</p>
            <ul className="mt-3 divide-y divide-rule border-y border-rule">
              {TOOLS.map(([n, d]) => (
                <li key={n} className="grid gap-2 py-5 md:grid-cols-[220px_1fr]">
                  <span className="num font-semibold text-mint">{n}</span>
                  <span className="text-[16px] text-chalk-quiet">{d}</span>
                </li>
              ))}
            </ul>
            <p className="num mt-6 text-[12px] text-chalk-quiet">RESOURCES · ringside://results · ringside://program</p>
          </div>
        </div>
      </section>
    </>
  );
}
