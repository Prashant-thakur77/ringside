// Spawns the built server over stdio and calls every tool and resource against the site snapshot.
// Usage: node test/smoke.mjs [command...]   (default: node dist/index.js)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.length > 2 ? process.argv.slice(2) : ["node", join(root, "dist/index.js")];
const env = { ...process.env };
delete env.RINGSIDE_INDEXER_URL; // exercise the snapshot path
const transport = new StdioClientTransport({ command, args, env, stderr: "ignore" });
const client = new Client({ name: "ringside-smoke", version: "0.0.0" });
await client.connect(transport);

let failed = 0;
const assert = (cond, msg) => {
  if (!cond) {
    failed++;
    console.log(`  FAIL ${msg}`);
  }
};
const text = (r) => r.content.map((c) => c.text).join("\n");
const json = (r) => JSON.parse(text(r).split("```json\n")[1].split("\n```")[0]);
async function call(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const t = text(r);
  console.log(`${r.isError ? "ERR " : "ok  "} ${name} ${JSON.stringify(args)} -> ${t.split("\n")[0].slice(0, 140)}`);
  assert(!r.isError, `${name} returned an error: ${t}`);
  return r;
}

const tools = (await client.listTools()).tools.map((t) => t.name).sort();
const want = ["courtsiding_report", "explain", "get_match", "get_odds_history", "get_stats", "list_matches", "verify_match"];
console.log(`tools: ${tools.join(", ")}`);
assert(JSON.stringify(tools) === JSON.stringify(want), "tool list");

const list = json(await call("list_matches", { limit: 10 }));
assert(list.matches.length > 0 && list.matches.length <= 10, "list_matches returns 1..10 rows");
const fin = json(await call("list_matches", { status: "finished", limit: 5 }));
assert(fin.matches.every((m) => ["Closed", "Settled", "Draw"].includes(m.status)), "finished filter");
const id = list.matches.find((m) => m.fills_ringside != null)?.match_id ?? list.matches[0].match_id;

const m = json(await call("get_match", { match_id: id }));
assert(m.match_id === id && m.books.ringside && typeof m.books.ringside.red.bid_usd === "number", "get_match books in dollars");
assert(m.books.ringside.red.ask_usd <= 1 && m.books.ringside.red.ask_usd >= 0, "prices in [0,1]");

const odds = json(await call("get_odds_history", { match_id: id, every: 50 }));
assert(odds.points.length > 3 && odds.points.every((p) => p.p_red >= 0 && p.p_red <= 1), "odds points");

const v = json(await call("verify_match", { match_id: id }));
assert(!v.verdict.startsWith("FAILED"), `verify_match verdict: ${v.verdict}`);
assert(v.checks.find((c) => c.check.startsWith("re-simulation")).ok === true, "WASM re-simulation ran and matched");
// The e2e match from docs/links.json is a complete record: it should fully verify.
const e2e = json(await call("verify_match", { match_id: "1795753242111" }));
console.log(`     e2e match: ${e2e.verdict}`);
assert(!e2e.verdict.startsWith("FAILED"), "e2e verify");

const cs = json(await call("courtsiding_report", { match_id: id }));
assert(cs.match && typeof cs.match.ringside.stale_rejections === "number", "courtsiding per match");
assert(cs.evaluation_e1.headline.stale_fills_accepted_ringside === 0, "E1 headline present");
await call("courtsiding_report", {});

const st = json(await call("get_stats"));
assert(st.indexer.counts?.matches > 0, "indexer counts");
assert(st.evaluation.e3_tick_cadence_ms?.p50 > 0 && st.evaluation.e5_privacy.attempts > 0 && st.evaluation.e6_replays?.of > 0, "eval headline");

for (const topic of ["tick", "freshness", "privacy", "settlement", "vrf", "architecture"]) {
  const r = await call("explain", { topic });
  assert(text(r).length > 200, `explain ${topic}`);
}

const res = (await client.listResources()).resources.map((r) => r.uri).sort();
assert(JSON.stringify(res) === JSON.stringify(["ringside://program", "ringside://results"]), "resources");
const prog = JSON.parse((await client.readResource({ uri: "ringside://program" })).contents[0].text);
assert(prog.program_id === "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej" && prog.links.program, "program resource");
const rj = JSON.parse((await client.readResource({ uri: "ringside://results" })).contents[0].text);
assert(rj.e1 && rj.headline, "results resource");
console.log(`resources: ${res.join(", ")}`);

await client.close();
console.log(failed ? `SMOKE: FAIL (${failed})` : "SMOKE: PASS");
process.exit(failed ? 1 : 0);
