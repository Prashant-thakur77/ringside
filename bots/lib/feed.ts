// One polling loop over the ER for all bots: discovers matches and emits every observed tick
// with the match and both books (one getMultipleAccounts per live match per poll).
import type { Connection } from "@solana/web3.js";
import { decodeMarket, decodeMatch, marketPda, matchPda, MODE_DELAYED, MODE_LIVE, type MarketAccount, type MatchAccount } from "@ringside/client";
import { listMatches } from "./discover.ts";

export interface TickFrame {
  id: bigint;
  m: MatchAccount;
  live: MarketAccount;
  delayed: MarketAccount;
  seenAt: number; // ms, local clock
}

export class Feed {
  private live = new Map<string, number>(); // id -> last tick seen
  private lobby = new Set<string>();
  private closed = new Set<string>();
  onLobby: (id: bigint, m: MatchAccount) => void = () => {};
  onTick: (f: TickFrame) => void = () => {};
  onClosed: (f: TickFrame) => void = () => {};

  constructor(readonly er: () => Promise<Connection>, readonly pollMs = 50) {}

  async start() {
    const discover = async () => {
      try {
        const er = await this.er();
        for (const { m } of await listMatches(er, [0, 1, 2])) {
          const k = m.matchId.toString();
          if (m.status === 0 && !this.lobby.has(k)) {
            this.lobby.add(k);
            this.onLobby(m.matchId, m);
          }
          if ((m.status === 1 || m.status === 2) && !this.live.has(k) && !this.closed.has(k)) this.live.set(k, -1);
        }
      } catch {
        /* transient */
      }
    };
    await discover();
    setInterval(discover, 2000);
    const poll = async () => {
      const er = await this.er();
      await Promise.all(
        [...this.live.keys()].map(async (k) => {
          const id = BigInt(k);
          const infos = await er.getMultipleAccountsInfo([matchPda(id), marketPda(id, MODE_LIVE), marketPda(id, MODE_DELAYED)]).catch(() => null);
          if (!infos?.[0] || !infos[1] || !infos[2]) return;
          const f: TickFrame = { id, m: decodeMatch(infos[0].data), live: decodeMarket(infos[1].data), delayed: decodeMarket(infos[2].data), seenAt: Date.now() };
          if (f.m.tick !== this.live.get(k)) {
            this.live.set(k, f.m.tick);
            this.onTick(f);
          }
          if (f.m.status >= 3) {
            this.live.delete(k);
            this.closed.add(k);
            this.onClosed(f);
          }
        }),
      );
      setTimeout(poll, this.pollMs);
    };
    void poll();
  }
}
