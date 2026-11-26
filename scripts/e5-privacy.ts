// E5: privacy leak test on devnet-tee. Reads a private Position N times as (a) a non-member with a
// valid TEE token, (b) an unauthenticated client, (c) the opposing fighter; then the owner (control);
// after the reveal, the non-member again. Baseline: a Position without a permission (plain ER) read
// by the non-member in one call. Usage: tsx scripts/e5-privacy.ts <matchId> <phase: live|revealed> [N]
import fs from "node:fs";
import path from "node:path";
import { Connection, type Keypair } from "@solana/web3.js";
import { marketPda, MODE_LIVE, positionPda } from "@ringside/client";
import { Env, ROOT, ensureKeypair, loadKeypair, profile, send, sleep } from "@ringside/client/node";

const [idArg, phase = "live", nArg = "20"] = process.argv.slice(2);
const id = BigInt(idArg);
const N = Number(nArg);
const env = new Env(profile());
const owner = ensureKeypair("courtsider");
const outsider = ensureKeypair("spec-1");
const fighter = ensureKeypair("fighter-b");
const plain = ensureKeypair("spec-3");
const target = positionPda(marketPda(id, MODE_LIVE), owner.publicKey);
const out = path.join(ROOT, `eval/data/e5-${env.p.name}.json`);
const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};

async function tries(conn: Connection | null, label: string): Promise<number> {
  let readable = 0;
  for (let i = 0; i < N; i++) {
    try {
      const info = await conn!.getAccountInfo(target);
      if (info && info.data.length > 0) readable++;
    } catch {
      /* denied at the RPC */
    }
  }
  console.log(`${label}: ${readable}/${N} readable`);
  return readable;
}
const as = (k: Keypair) => env.er(k);

if (phase === "live") {
  const unauth = new Connection(env.p.erRpc, "confirmed");
  const r = {
    non_member: await tries(await as(outsider), "non-member with token"),
    unauthenticated: await tries(unauth, "unauthenticated"),
    opposing_fighter: await tries(await as(fighter), "opposing fighter"),
    owner_control: await tries(await as(owner), "owner (control)"),
  };
  // Baseline: a Position with no permission (plain ER account) is readable by anyone with a token.
  const admin = loadKeypair("admin");
  const market = marketPda(id, MODE_LIVE);
  const plainPos = positionPda(market, plain.publicKey);
  if (!(await env.base.getAccountInfo(plainPos))) {
    await send(env.base, [await env.ix.joinPosition(admin.publicKey, plain.publicKey, market), await env.ix.delegatePosition(admin.publicKey, plain.publicKey, market, env.p.validator)], [admin]);
    await sleep(3000);
  }
  let plainReadable = false;
  try {
    plainReadable = !!(await (await as(outsider)).getAccountInfo(plainPos));
  } catch {}
  fs.writeFileSync(out, JSON.stringify({ ...prev, match_id: id.toString(), n: N, attempts: { non_member: N, unauthenticated: N, opposing_fighter: N },
    denied: { non_member: N - r.non_member, unauthenticated: N - r.unauthenticated, opposing_fighter: N - r.opposing_fighter }, owner_control_readable: r.owner_control, plain_er_readable: plainReadable, target: target.toBase58() }, null, 2));
} else {
  const after = await tries(await as(outsider), "non-member after reveal");
  fs.writeFileSync(out, JSON.stringify({ ...prev, after_reveal_readable: after === N, after_reveal_reads: after }, null, 2));
}
