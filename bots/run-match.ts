// Runs one match end to end. Usage: tsx run-match.ts [--a ai|aggressive|kiting|defensive|random] [--b ...] [--delay 5000] [--no-crank]
import { Env, ensureKeypair, loadKeypair, profile } from "@ringside/client/node";
import { brainFor } from "./lib/brains.ts";
import { MatchRunner } from "./lib/runner.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const env = new Env(profile());
const runner = new MatchRunner(
  env,
  loadKeypair("admin"),
  ensureKeypair("keeper"),
  [ensureKeypair("fighter-a"), ensureKeypair("fighter-b")],
  [await brainFor(arg("a", "aggressive")), await brainFor(arg("b", "kiting"))],
  { stake: BigInt(arg("stake", "1000000")), delayMs: Number(arg("delay", "5000")), crank: !process.argv.includes("--no-crank"), tickMs: 100 },
);
const t0 = Date.now();
const r = await runner.run();
console.log(JSON.stringify({ ...r, id: r.id.toString(), positions: r.positions.map(String), seconds: (Date.now() - t0) / 1000 }, null, 2));
process.exit(0);
