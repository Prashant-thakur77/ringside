// Snapshots one finished devnet match (from the indexer) for the home page story:
// the tick with the largest one-tick price move (a hit), the ticks around it, and real state hashes.
// Usage: node scripts/snapshot-home.mjs <matchId> [indexerUrl]
import fs from "node:fs";
const [id, base = "http://127.0.0.1:8787"] = process.argv.slice(2);
const r = await (await fetch(`${base}/matches/${id}/replay`)).json();
if (!r.complete) throw new Error("replay incomplete");
const t = r.ticks;
let hit = 1;
for (let i = 80; i < t.length - 66; i++) if (Math.abs(t[i].fair_p - t[i - 1].fair_p) > Math.abs(t[hit].fair_p - t[hit - 1].fair_p)) hit = i;
const from = Math.max(0, hit - 80), to = Math.min(t.length, hit + 66);
const out = {
  match_id: r.match_id, match_key: r.match_key, ticks_total: t.length, seeds: r.seeds.length,
  hit_tick: t[hit].tick,
  window: t.slice(from, to).map((x) => ({ tick: x.tick, p: Math.round(x.fair_p * 1e4) / 1e4, hash: x.hash, flags: x.flags })),
  tape: t.filter((_, i) => i % Math.max(1, Math.floor(t.length / 40)) === 0).map((x) => ({ tick: x.tick, hash: x.hash.slice(0, 16) })),
  walk: t.map((x) => Math.round(x.fair_p * 1e3) / 1e3),
};
fs.writeFileSync(new URL("../public/home/gap.json", import.meta.url), JSON.stringify(out));
console.log(`match ${id}: hit at tick ${out.hit_tick} (${t[hit - 1].fair_p.toFixed(3)} → ${t[hit].fair_p.toFixed(3)}), ${out.window.length} window ticks`);
// Explorer proof links for the receipts slider (from the devnet e2e run).
const links = JSON.parse(fs.readFileSync(new URL("../../../docs/links.json", import.meta.url), "utf8"));
const keep = ["trade_fill", "session_trade", "stale_reject", "fighter_reject", "vrf_callback", "reveal", "commit", "match_record", "program", "repo"];
fs.writeFileSync(new URL("../public/home/links.json", import.meta.url), JSON.stringify(Object.fromEntries(keep.filter((k) => links[k]).map((k) => [k, links[k]]))));
