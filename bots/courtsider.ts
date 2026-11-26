// The courtsider: watches the live game state every tick and fires the same intent at both books.
// On the TV-delay book it buys at the stale price it sees on "TV" (and fills: the book cannot know
// its feed is late). On the Ringside book the same stale quote is stamped with the TV tick and is
// rejected onchain (ErrStaleTick). Also tries the Ringside book at the live tick for comparison.
import fs from "node:fs";
import path from "node:path";
import type { Keypair } from "@solana/web3.js";
import { MODE_DELAYED, MODE_LIVE, PAYOUT, positionPda, marketPda } from "@ringside/client";
import { Env, ROOT, ensureKeypair, errorCode, loadKeypair, profile, send } from "@ringside/client/node";
import { Feed, type TickFrame } from "./lib/feed.ts";
import { joinPositions } from "./lib/positions.ts";
import { timed } from "./lib/telemetry.ts";

export interface CourtsiderStats {
  id: string;
  delayMs: number;
  attemptsDelayed: number;
  fillsDelayed: number;
  staleFillsAccepted: number;
  attemptsLiveStale: number;
  rejectsLiveStale: number;
  fillsLiveStale: number;
  transportErrors: number;
  attemptsLiveFresh: number;
  fillsLiveFresh: number;
  sigs: { delayedFill?: string; liveStaleReject?: string; liveStaleRejectRecorded?: string };
  winner?: number;
  pnlDelayed?: number;
  pnlLive?: number;
  housePnlDelayed?: number;
  housePnlLive?: number;
}

const MARGIN = Number(process.env.COURTSIDER_MARGIN ?? 0.02);
const QTY = BigInt(process.env.COURTSIDER_QTY ?? 4);
const COOLDOWN_TICKS = 5;

export function startCourtsider(env: Env, feed: Feed, opts: { me?: Keypair; payer?: Keypair; out?: string; log?: (s: string) => void } = {}) {
  const me = opts.me ?? ensureKeypair("courtsider");
  const payer = opts.payer ?? loadKeypair("admin");
  const log = opts.log ?? console.log;
  const out = opts.out ?? path.join(ROOT, "eval/data", `courtsider-${env.p.name}.jsonl`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const stats = new Map<string, CourtsiderStats>();
  const lastShot = new Map<string, number>();
  let strictCount = 0;

  const prevLobby = feed.onLobby;
  feed.onLobby = (id, m) => {
    prevLobby(id, m);
    joinPositions(env, payer, me, id).catch((e) => log(`courtsider join ${id}: ${String(e).split("\n")[0]}`));
  };

  const fire = async (f: TickFrame) => {
    const k = f.id.toString();
    const s =
      stats.get(k) ??
      ({ id: k, delayMs: f.delayed.delayMs, attemptsDelayed: 0, fillsDelayed: 0, staleFillsAccepted: 0, attemptsLiveStale: 0, rejectsLiveStale: 0, fillsLiveStale: 0, transportErrors: 0, attemptsLiveFresh: 0, fillsLiveFresh: 0, sigs: {} } as CourtsiderStats);
    stats.set(k, s);
    if (f.m.status !== 1 && f.m.status !== 2) return;
    if ((lastShot.get(k) ?? -99) + COOLDOWN_TICKS > f.m.tick) return;
    const pLive = Number(f.live.mid) / 1e6; // the truth now (priced in the same rollup state)
    const edgeA = pLive - Number(f.delayed.askA) / 1e6;
    const edgeB = 1 - pLive - Number(f.delayed.askB) / 1e6;
    const side = edgeA > MARGIN ? "A" : edgeB > MARGIN ? "B" : null;
    if (!side || f.delayed.lastPricedTick === 0n) return;
    lastShot.set(k, f.m.tick);
    const er = await env.er(me);
    const tvTick = f.delayed.lastPricedTick; // the tick the TV feed is showing
    const tvAsk = side === "A" ? f.delayed.askA : f.delayed.askB;

    // 1. TV-delay book: priced off the late feed, so the stale quote fills.
    s.attemptsDelayed++;
    try {
      const r = await timed("trade", { match: f.m.matchId.toString(), book: "tv_delay" }, async () => send(er, [await env.ix.trade(me.publicKey, me.publicKey, f.id, MODE_DELAYED, tvTick, side, "buy", QTY, tvAsk, false)], [me], { skipPreflight: true }));
      s.fillsDelayed++;
      if (BigInt(f.m.tick) > tvTick + 2n) s.staleFillsAccepted++;
      s.sigs.delayedFill ??= r.sig;
    } catch (e) {
      log(`delayed ${k}: ${errorCode(e)}`);
    }
    // 2. Ringside book, same stale quote stamped with the TV tick: rejected onchain.
    s.attemptsLiveStale++;
    const strict = strictCount++ % 10 === 0; // every 10th attempt fails the tx (explorer proof)
    try {
      const r = await send(er, [await env.ix.trade(me.publicKey, me.publicKey, f.id, MODE_LIVE, tvTick, side, "buy", QTY, tvAsk, !strict)], [me], { skipPreflight: true });
      // recorded mode: tx succeeds without a fill if rejected; detect via the counter
      s.rejectsLiveStale++;
      s.sigs.liveStaleRejectRecorded ??= r.sig;
    } catch (e) {
      const c = errorCode(e);
      if (c === 6000) {
        s.rejectsLiveStale++;
        s.sigs.liveStaleReject ??= (e as Error & { sig?: string }).sig;
      } else if (c === null) s.transportErrors++; // never reached the program: not a fill
    }
    // 3. Ringside book at the live tick: fills, but at the fair (already updated) price.
    s.attemptsLiveFresh++;
    try {
      const liveAsk = side === "A" ? f.live.askA : f.live.askB;
      await timed("trade", { match: f.m.matchId.toString(), book: "ringside" }, async () => send(er, [await env.ix.trade(me.publicKey, me.publicKey, f.id, MODE_LIVE, f.live.lastPricedTick, side, "buy", 1n, liveAsk + 5_000n, false)], [me], { skipPreflight: true }));
      s.fillsLiveFresh++;
    } catch {
      /* stale by the time it landed, or frozen */
    }
  };

  const prevTick = feed.onTick;
  feed.onTick = (f) => {
    prevTick(f);
    void fire(f);
  };

  const prevClosed = feed.onClosed;
  feed.onClosed = (f) => {
    prevClosed(f);
    const k = f.id.toString();
    const s = stats.get(k);
    if (!s) return;
    // Final PnL once the books settle and positions are revealed (public).
    const finish = async (tries = 0): Promise<void> => {
      const er = await env.er(me);
      const pnl = async (mode: number) => {
        const info = await er.getAccountInfo(positionPda(marketPda(f.id, mode), me.publicKey));
        if (!info) return 0;
        const d = info.data;
        const sa = d.readBigUInt64LE(8 + 64);
        const sb = d.readBigUInt64LE(8 + 72);
        const cost = d.readBigInt64LE(8 + 80);
        const w = f.m.winner;
        const pay = w === 1 ? sa * PAYOUT : w === 2 ? sb * PAYOUT : cost > 0n ? cost : 0n;
        return Number(pay - cost) / 1e6;
      };
      const m = await er.getMultipleAccountsInfo([marketPda(f.id, MODE_LIVE), marketPda(f.id, MODE_DELAYED)]);
      const { decodeMarket } = await import("@ringside/client");
      const books = m.map((x) => (x ? decodeMarket(x.data) : null));
      if ((!books[0] || books[0].status !== 2) && tries < 60) {
        setTimeout(() => void finish(tries + 1), 1000);
        return;
      }
      const hp = (b: ReturnType<typeof decodeMarket> | null) => {
        if (!b) return 0;
        const paid = b.winner === 1 ? b.invA * PAYOUT : b.winner === 2 ? b.invB * PAYOUT : b.houseCash > 0n ? b.houseCash : 0n;
        return Number(b.houseCash - paid) / 1e6;
      };
      s.winner = f.m.winner;
      s.pnlDelayed = await pnl(MODE_DELAYED);
      s.pnlLive = await pnl(MODE_LIVE);
      s.housePnlDelayed = hp(books[1]);
      s.housePnlLive = hp(books[0]);
      s.rejectsLiveStale = Math.max(s.rejectsLiveStale, Number(books[0]?.nRejectedStale ?? 0n));
      fs.appendFileSync(out, JSON.stringify(s) + "\n");
      log(`courtsider ${k}: delayed pnl ${s.pnlDelayed.toFixed(2)} (${s.fillsDelayed} fills, ${s.staleFillsAccepted} stale accepted) · ringside pnl ${s.pnlLive.toFixed(2)} (${s.rejectsLiveStale} stale rejected, ${s.fillsLiveFresh} fresh fills)`);
    };
    void finish();
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = new Env(profile());
  const feed = new Feed(() => env.er(ensureKeypair("courtsider")));
  startCourtsider(env, feed);
  await feed.start();
}
