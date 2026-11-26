// Fallback keeper (Switch A): calls the permissionless, time-gated `tick` at tick_ms for every
// live match whose crank is not advancing it.
import { Env, ensureKeypair, errorCode, profile, send } from "@ringside/client/node";
import { listMatches } from "./lib/discover.ts";

const env = new Env(profile());
const keeper = ensureKeypair("keeper");
const tickMs = Number(process.env.TICK_MS ?? 100);
const lastSeen = new Map<string, { tick: number; at: number }>();
setInterval(async () => {
  const er = await env.er(keeper);
  const live = await listMatches(er, [1, 2]).catch(() => []);
  for (const { m } of live) {
    const k = m.matchId.toString();
    const s = lastSeen.get(k);
    const now = Date.now();
    if (!s || s.tick !== m.tick) lastSeen.set(k, { tick: m.tick, at: now });
    const stalled = s && s.tick === m.tick && now - s.at > 3 * tickMs;
    if (!stalled && process.env.KEEPER_ALWAYS !== "1") continue;
    send(er, [await env.ix.tick(m.matchId, env.p.modelVersion)], [keeper], { skipPreflight: true }).catch((e) => {
      if (errorCode(e) !== 6007) console.log(`keeper ${k}: ${String((e as Error).message).split("\n")[0]}`);
    });
  }
}, tickMs);
console.log(`keeper running on ${env.p.name} at ${tickMs} ms`);
