// Funds bot wallets: a little SOL for base-layer fees, test-dollars deposited into the ER,
// and delegated Profiles for the fighters.
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { depositToEr, ensureKeypair, readState, send } from "@ringside/client/node";
import { profilePda } from "@ringside/client";
import { admin, env, log } from "./common.ts";

const st = readState(env.p.name);
const bots = (process.env.BOTS ?? "fighter-a,fighter-b,spec-1,spec-2,spec-3,spec-4,courtsider").split(",");
const per = BigInt(process.env.BOT_AMOUNT ?? 100_000_000);
for (const name of bots) {
  const k = ensureKeypair(name);
  const sol = await env.base.getBalance(k.publicKey);
  if (sol < 0.02 * LAMPORTS_PER_SOL) {
    await send(env.base, [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: k.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL })], [admin]);
  }
  const a = await getOrCreateAssociatedTokenAccount(env.base, admin, env.p.mint, k.publicKey);
  if (st.mintKind === "test-dollar" && a.amount < per) await mintTo(env.base, admin, env.p.mint, a.address, admin, per);
  const d = await depositToEr(env, k, per, admin);
  if (name.startsWith("fighter") || name.startsWith("ai-")) {
    if (!(await env.base.getAccountInfo(profilePda(k.publicKey)))) {
      await send(env.base, [await env.ix.createProfile(admin.publicKey, k.publicKey), await env.ix.delegateProfile(admin.publicKey, k.publicKey, env.p.validator)], [admin]);
    }
  }
  log(name, k.publicKey.toBase58(), "deposit", d.sig);
}
