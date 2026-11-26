// Labeled spectator bots (momentum, contrarian, noise, Kelly-sized) trading the Ringside book
// and, less often, the TV-delay book.
import type { Keypair } from "@solana/web3.js";
import { MODE_DELAYED, MODE_LIVE } from "@ringside/client";
import { Env, ensureKeypair, errorCode, loadKeypair, profile, send } from "@ringside/client/node";
import { Feed } from "../lib/feed.ts";
import { joinPositions } from "../lib/positions.ts";
import { view } from "../lib/wasm.ts";
import { STYLES } from "./styles.ts";

export const SPECTATORS: { key: string; style: keyof typeof STYLES }[] = [
  { key: "spec-1", style: "momentum" },
  { key: "spec-2", style: "contrarian" },
  { key: "spec-3", style: "noise" },
  { key: "spec-4", style: "kelly" },
];

export function startSpectators(env: Env, feed: Feed, log = console.log) {
  const payer = loadKeypair("admin");
  const bots = SPECTATORS.map((s) => ({ ...s, kp: ensureKeypair(s.key) as Keypair, mids: new Map<string, number[]>(), joined: new Set<string>() }));
  let seed = 12345;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const prevLobby = feed.onLobby;
  feed.onLobby = (id, m) => {
    prevLobby(id, m);
    for (const b of bots) joinPositions(env, payer, b.kp, id).then(() => b.joined.add(id.toString())).catch((e) => log(`${b.key} join: ${String(e).split("\n")[0]}`));
  };
  const prevTick = feed.onTick;
  feed.onTick = (f) => {
    prevTick(f);
    const k = f.id.toString();
    const v = view(f.m.sim);
    const hpView = (Math.max(0, v.fighters[0].hp) + 1) / (Math.max(0, v.fighters[0].hp) + Math.max(0, v.fighters[1].hp) + 2);
    for (const b of bots) {
      if (!b.joined.has(k)) continue;
      const mids = b.mids.get(k) ?? [];
      mids.push(Number(f.live.mid) / 1e6);
      if (mids.length > 60) mids.shift();
      b.mids.set(k, mids);
      if (f.m.tick % 3 !== 0) continue;
      const mode = rng() < 0.85 ? MODE_LIVE : MODE_DELAYED;
      const book = mode === MODE_LIVE ? f.live : f.delayed;
      const o = STYLES[b.style]({ book, mids, hpView, bankroll: 50, rng });
      if (!o) continue;
      const limit = o.side === "A" ? book.askA + 10_000n : book.askB + 10_000n;
      void env.er(b.kp).then(async (er) =>
        send(er, [await env.ix.trade(b.kp.publicKey, b.kp.publicKey, f.id, mode, book.lastPricedTick, o.side, o.dir, o.qty, limit, false)], [b.kp], { skipPreflight: true }).catch((e) => {
          const c = errorCode(e);
          if (c !== 6000 && c !== 6003 && c !== 6012 && c !== 6004) log(`${b.key} trade: ${c ?? String(e).split("\n")[0]}`);
        }),
      );
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = new Env(profile());
  const feed = new Feed(() => env.er(loadKeypair("admin")));
  startSpectators(env, feed);
  await feed.start();
}
