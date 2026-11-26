// Spectator trading styles. Each returns an order (or null) from the live book and recent mids.
import type { MarketAccount } from "@ringside/client";

export interface Order {
  side: "A" | "B";
  dir: "buy" | "sell";
  qty: bigint;
}

export interface Ctx {
  book: MarketAccount;
  mids: number[]; // recent mids (0..1), newest last
  hpView: number; // spectator's own read: hp_a / (hp_a + hp_b)
  bankroll: number; // USDC
  rng: () => number;
}

const ask = (b: MarketAccount, side: "A" | "B") => Number(side === "A" ? b.askA : b.askB) / 1e6;

export const STYLES: Record<string, (c: Ctx) => Order | null> = {
  momentum: ({ mids }) => {
    if (mids.length < 20) return null;
    const d = mids[mids.length - 1] - mids[mids.length - 20];
    if (Math.abs(d) < 0.04) return null;
    return { side: d > 0 ? "A" : "B", dir: "buy", qty: 2n };
  },
  contrarian: ({ mids }) => {
    if (mids.length < 20) return null;
    const d = mids[mids.length - 1] - mids[mids.length - 20];
    if (Math.abs(d) < 0.06) return null;
    return { side: d > 0 ? "B" : "A", dir: "buy", qty: 2n };
  },
  noise: ({ rng }) => (rng() < 0.08 ? { side: rng() < 0.5 ? "A" : "B", dir: "buy", qty: BigInt(1 + Math.floor(rng() * 3)) } : null),
  kelly: ({ book, hpView, bankroll }) => {
    for (const side of ["A", "B"] as const) {
      const p = side === "A" ? hpView : 1 - hpView;
      const price = ask(book, side);
      const edge = p - price;
      if (edge > 0.05) {
        const f = edge / (1 - price); // Kelly fraction for a binary contract
        const qty = Math.max(1, Math.min(10, Math.floor((0.25 * f * bankroll) / price)));
        return { side, dir: "buy", qty: BigInt(qty) };
      }
    }
    return null;
  },
};
