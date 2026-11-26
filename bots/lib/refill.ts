// Keeps bot wallets funded inside the rollup (test-dollar mint only): mints on the base layer and
// deposits into the ER whenever a bot's ER balance drops below `min`.
import { getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import type { Keypair } from "@solana/web3.js";
import { type Env, depositToEr, readState } from "@ringside/client/node";

export async function refill(env: Env, admin: Keypair, bots: Keypair[], min = 10_000_000n, amount = 100_000_000n, log = console.log) {
  if (readState(env.p.name).mintKind !== "test-dollar") return;
  for (const k of bots) {
    try {
      const er = await env.er(k);
      const bal = await getAccount(er, env.ata(k.publicKey)).then((a) => a.amount).catch(() => 0n);
      if (bal >= min) continue;
      const a = await getOrCreateAssociatedTokenAccount(env.base, admin, env.p.mint, k.publicKey);
      if (a.amount < amount) await mintTo(env.base, admin, env.p.mint, a.address, admin, amount);
      await depositToEr(env, k, amount, admin);
      log(`refilled ${k.publicKey.toBase58()} with ${Number(amount) / 1e6}`);
    } catch (e) {
      log(`refill ${k.publicKey.toBase58()}: ${String((e as Error).message).split("\n")[0]}`);
    }
  }
}
