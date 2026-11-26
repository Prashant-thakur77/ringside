// 24/7 lobby: back-to-back AI matches (clearly labeled AI) with spectators, the delay relay and
// the courtsider running alongside. Usage: tsx lobby.ts [--matches N] [--delays 500,1000,2000,5000,8000]
import { Env, ensureKeypair, loadKeypair, profile } from "@ringside/client/node";
import { brainFor, POLICIES } from "./lib/brains.ts";
import { Feed } from "./lib/feed.ts";
import { MatchRunner } from "./lib/runner.ts";
import { startCourtsider } from "./courtsider.ts";
import { startRelay } from "./delay-relay.ts";
import { startSpectators } from "./spectators/run.ts";
import { refill } from "./lib/refill.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const env = new Env(profile());
const admin = loadKeypair("admin");
const feed = new Feed(() => env.er(admin));
startRelay(env, feed);
startSpectators(env, feed);
if (!process.argv.includes("--no-courtsider")) startCourtsider(env, feed);
await feed.start();

const total = Number(arg("matches", "0")); // 0 = forever
const delays = arg("delays", "5000").split(",").map(Number);
const ai = await brainFor("ai");
const botWallets = ["spec-1", "spec-2", "spec-3", "spec-4", "courtsider", "fighter-a", "fighter-b"].map(ensureKeypair);
for (let n = 0; total === 0 || n < total; n++) {
  if (n % 5 === 0) await refill(env, admin, botWallets);
  const opp = n % 3 === 0 ? ai : await brainFor(POLICIES[n % POLICIES.length]);
  const delay = delays[n % delays.length];
  const runner = new MatchRunner(env, admin, ensureKeypair("keeper"), [ensureKeypair("fighter-a"), ensureKeypair("fighter-b")], [ai, opp], {
    stake: 1_000_000n,
    delayMs: delay,
    crank: process.env.KEEPER_ONLY !== "1",
    tickMs: 100,
    onCreated: async () => new Promise((r) => setTimeout(r, 6000)), // spectators join before the bell
  });
  try {
    const r = await runner.run();
    console.log(`[lobby] match ${r.id} (${ai.label} vs ${opp.label}, delay ${delay} ms): winner ${r.winner} at tick ${r.ticks}, ${r.crank}, record ${r.recordWritten}`);
  } catch (e) {
    console.log(`[lobby] match failed: ${String((e as Error).message).split("\n")[0]}`);
  }
}
process.exit(0);
