// Exports finished devnet matches from the indexer into public/snap/, so the site can show real results and
// verifiable replays when the live indexer is unreachable. Usage: node scripts/snapshot-indexer.mjs [indexer-url]
import fs from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8787";
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "../public/snap");
const get = async (p) => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.json();
};
const save = (p, data) => {
  const f = path.join(OUT, `${p}.json`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data));
};

fs.rmSync(OUT, { recursive: true, force: true });
const all = await get("/matches?limit=200");
const done = all.filter((m) => m.status >= 3); // only finished matches: a snapshot never claims a bout is live
save("/matches", done);
save("/stats", await get("/stats"));
for (const m of done) {
  for (const sub of ["replay", "state"]) {
    try { save(`/matches/${m.match_id}/${sub}`, await get(`/matches/${m.match_id}/${sub}`)); } catch (e) { console.warn(String(e)); }
  }
  try { save(`/judge/${m.match_id}`, await get(`/judge/${m.match_id}`)); } catch {}
}
console.log(`snapshot: ${done.length} finished matches -> public/snap`);
