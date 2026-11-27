// Prepares K soak wallets for match <id>: SOL, test-dollars deposited into the ER, live-book
// positions created, delegated and made private. Usage: tsx soak/setup.ts <matchId> <K>
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { MODE_LIVE } from "@ringside/client";
import { Env, depositToEr, ensureKeypair, loadKeypair, profile, readState, send } from "@ringside/client/node";
import { joinPositions } from "../lib/positions.ts";

const id = BigInt(process.argv[2]);
const k = Number(process.argv[3] ?? 16);
const env = new Env(profile());
const admin = loadKeypair("admin");
const st = readState(env.p.name);
async function ready(i: number) {
  const w = ensureKeypair(`soak-${i}`);
  if ((await env.base.getBalance(w.publicKey)) < 0.01 * LAMPORTS_PER_SOL)
    await send(env.base, [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: w.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL })], [admin]);
  const a = await getOrCreateAssociatedTokenAccount(env.base, admin, env.p.mint, w.publicKey);
  if (st.mintKind === "test-dollar" && a.amount < 50_000_000n) await mintTo(env.base, admin, env.p.mint, a.address, admin, 50_000_000n);
  await depositToEr(env, w, 50_000_000n, admin);
  await joinPositions(env, admin, w, id, [MODE_LIVE]);
}
// Batches of 4 with retries: devnet RPCs drop or expire bursts of base-layer transactions.
for (let b = 0; b < k; b += 4) {
  await Promise.all(
    Array.from({ length: Math.min(4, k - b) }, async (_, j) => {
      for (let t = 0; ; t++) {
        try {
          return await ready(b + j);
        } catch (e) {
          if (t >= 2) throw e;
          console.log(`soak-${b + j} retry ${t + 1}: ${String((e as Error).message).split("\n")[0]}`);
        }
      }
    }),
  );
}
console.log(`soak wallets ready: ${k}`);
