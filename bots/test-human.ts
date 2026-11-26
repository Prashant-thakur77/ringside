// Plays the human side of a "Fight an AI" challenge through the matchmaker (integration test).
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { Env, depositToEr, ensureKeypair, loadKeypair, profile, readState, send, sleep } from "@ringside/client/node";
import { decodeMatch, matchPda } from "@ringside/client";

const env = new Env(profile());
const admin = loadKeypair("admin");
const me = ensureKeypair("human-test");
const st = readState(env.p.name);
if ((await env.base.getBalance(me.publicKey)) < 0.01 * LAMPORTS_PER_SOL) await send(env.base, [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: me.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })], [admin]);
const a = await getOrCreateAssociatedTokenAccount(env.base, admin, env.p.mint, me.publicKey);
if (st.mintKind === "test-dollar" && a.amount < 5_000_000n) await mintTo(env.base, admin, env.p.mint, a.address, admin, 5_000_000n);
await depositToEr(env, me, 3_000_000n, admin);
const r = await fetch(`http://127.0.0.1:${process.env.MATCHMAKER_PORT ?? 8788}/challenge`, { method: "POST", body: JSON.stringify({ player: me.publicKey.toBase58(), stake: 1 }) }).then((x) => x.json());
console.log("challenge", r);
const id = BigInt(r.matchId);
const er = await env.er(me);
console.log("join", (await send(er, [await env.ix.joinFight(me.publicKey, me.publicKey, id)], [me])).sig);
let seq = 0n;
for (;;) {
  const g = decodeMatch((await er.getAccountInfo(matchPda(id)))!.data);
  if (g.status >= 3) {
    console.log(`over: status ${g.status} winner ${g.winner} tick ${g.tick}`);
    break;
  }
  seq += 1n;
  const bits = (1 + Math.floor(Math.random() * 8)) | (1 << 4) | (8 << 8);
  send(er, [await env.ix.submitInput(me.publicKey, me.publicKey, id, seq, bits)], [me], { skipPreflight: true }).catch(() => {});
  await sleep(150);
}
process.exit(0);
