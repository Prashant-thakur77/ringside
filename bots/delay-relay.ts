// TV-delay relay: replays each live match's features into its Delayed book `delay_ms` late.
// Same pricing code onchain, different (late) feed.
import { Env, ensureKeypair, profile, send } from "@ringside/client/node";
import { Feed, type TickFrame } from "./lib/feed.ts";
import { sim, view } from "./lib/wasm.ts";

export function startRelay(env: Env, feed: Feed, log = console.log) {
  const relay = ensureKeypair("relay");
  const queues = new Map<string, { at: number; tick: bigint; features: bigint[]; timeLeft: number; lethal: boolean }[]>();
  const lastHp = new Map<string, [number, number]>();
  const prevOn = feed.onTick;
  feed.onTick = (f: TickFrame) => {
    prevOn(f);
    const k = f.id.toString();
    const v = view(f.m.sim);
    const hp: [number, number] = [v.fighters[0].hp, v.fighters[1].hp];
    const prev = lastHp.get(k) ?? [100, 100];
    lastHp.set(k, hp);
    const lethal = (hp[0] < prev[0] && hp[0] <= 12) || (hp[1] < prev[1] && hp[1] <= 12);
    const q = queues.get(k) ?? [];
    q.push({ at: f.seenAt + f.delayed.delayMs, tick: BigInt(f.m.tick), features: Array.from(sim.features(f.m.sim)), timeLeft: Math.max(0, 90_000 - v.timeMs), lethal });
    queues.set(k, q);
  };
  setInterval(async () => {
    const now = Date.now();
    for (const [k, q] of queues) {
      let due: (typeof q)[number] | undefined;
      while (q.length && q[0].at <= now) due = q.shift();
      if (!due) continue;
      try {
        const er = await env.er(relay);
        await send(er, [await env.ix.relayDelayedState(relay.publicKey, BigInt(k), env.p.modelVersion, due.tick, due.features, due.timeLeft, due.lethal)], [relay], { skipPreflight: true });
      } catch (e) {
        const msg = String((e as Error).message);
        if (!msg.includes("6004") && !msg.includes("6006")) log(`relay ${k}: ${msg.split("\n")[0]}`);
        if (msg.includes("6004")) queues.delete(k);
      }
    }
  }, 50);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = new Env(profile());
  const feed = new Feed(() => env.er(ensureKeypair("relay")));
  startRelay(env, feed);
  await feed.start();
}
