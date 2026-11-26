// End-to-end proof run: one full live match with every onchain proof captured.
//   join → VRF wave → crank ticks → trades → stale-tick reject → fighter-bar reject → session-key
//   trade → settle (reveal) → claim → finalize + MatchRecord on L1.
// Writes docs/links.json (explorer links for README / submission) and docs/spike.md.
// Usage: RINGSIDE_ENV=devnet npx tsx scripts/e2e.ts
import fs from "node:fs";
import path from "node:path";
import BN from "bn.js";
import { createApproveInstruction } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { GetCommitmentSignature } from "@magicblock-labs/ephemeral-rollups-sdk";
import { SessionTokenManager } from "@magicblock-labs/gum-sdk";
import { configPda, MODE_DELAYED, MODE_LIVE, modelPda, PROGRAM_ID, recordPda, SESSION_KEYS_PROGRAM, matchPda } from "@ringside/client";
import { Env, ROOT, ensureKeypair, errorCode, loadKeypair, profile, send, sleep } from "@ringside/client/node";
import { brainFor } from "../bots/lib/brains.ts";
import { MatchRunner } from "../bots/lib/runner.ts";
import { joinPositions } from "../bots/lib/positions.ts";
import { refill } from "../bots/lib/refill.ts";
import { execFileSync } from "node:child_process";

const env = new Env(profile());
const admin = loadKeypair("admin");
const keeper = ensureKeypair("keeper");
const [fa, fb] = [ensureKeypair("fighter-a"), ensureKeypair("fighter-b")];
const spec = ensureKeypair("spec-1");
const sessionUser = ensureKeypair("session-user");
const courtsider = ensureKeypair("courtsider");
const links: Record<string, string> = {};
const spike: string[] = [];
const tx = (sig: string, er = true) => env.p.explorer(sig, er);
const addr = (a: PublicKey) => (env.p.name === "devnet" ? `https://explorer.solana.com/address/${a.toBase58()}?cluster=devnet` : a.toBase58());
const log = (s: string) => console.log(`[e2e] ${s}`);

async function strict(label: string, who: Keypair, build: () => Promise<import("@solana/web3.js").TransactionInstruction>, expect: number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await send(await env.er(who), [await build()], [who], { skipPreflight: true });
      log(`${label}: unexpectedly succeeded`);
      return null;
    } catch (e) {
      const c = errorCode(e);
      const sig = (e as { sig?: string }).sig ?? "";
      log(`${label}: error ${c} ${sig}`);
      if (c === expect) return sig;
      if (c !== null) return null; // a different program error: report it, don't retry
      await sleep(400); // transport error (blockhash / timeout): retry
    }
  }
  return null;
}

/** Session key V2 for `user`, scoped to Ringside, plus an SPL allowance for it on the ER. */
async function makeSession(user: Keypair) {
  const kp = Keypair.generate();
  const validUntil = Math.floor(Date.now() / 1000) + 2 * 3600;
  const token = PublicKey.findProgramAddressSync([Buffer.from("session_token_v2"), PROGRAM_ID.toBuffer(), kp.publicKey.toBuffer(), user.publicKey.toBuffer()], SESSION_KEYS_PROGRAM)[0];
  const wallet = { publicKey: user.publicKey, signTransaction: async (t: Transaction) => (t.partialSign(user), t), signAllTransactions: async (ts: Transaction[]) => ts.map((t) => (t.partialSign(user), t)), payer: user };
  const mgr = new SessionTokenManager(wallet as never, env.base);
  const ix = await mgr.program.methods.createSessionV2(true, new BN(validUntil), new BN(5_000_000)).accounts({ sessionToken: token, sessionSigner: kp.publicKey, feePayer: user.publicKey, authority: user.publicKey, targetProgram: PROGRAM_ID } as never).instruction();
  const s1 = await send(env.base, [ix], [user, kp]);
  const s2 = await send(await env.er(user), [createApproveInstruction(env.ata(user.publicKey), kp.publicKey, user.publicKey, 20_000_000n)], [user]);
  log(`session ${kp.publicKey.toBase58()} token ${token.toBase58()} (${s1.sig}, approve ${s2.sig})`);
  return { kp, token, createSig: s1.sig };
}

// The session user pays its own session creation on the base layer.
if ((await env.base.getBalance(sessionUser.publicKey)) < 0.02 * LAMPORTS_PER_SOL)
  await send(env.base, [SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: sessionUser.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })], [admin]);
await refill(env, admin, [spec, sessionUser, courtsider, fa, fb], 20_000_000n, 50_000_000n, log);

const runner = new MatchRunner(env, admin, keeper, [fa, fb], [await brainFor("ai"), await brainFor("kiting")], {
  stake: 1_000_000n,
  delayMs: 5000,
  crank: true,
  tickMs: 100,
  onLog: log,
  onCreated: async (id) => {
    for (const k of [spec, courtsider, fa]) await joinPositions(env, admin, k, id, k === courtsider ? [MODE_LIVE, MODE_DELAYED] : [MODE_LIVE]);
    await joinPositions(env, admin, sessionUser, id, [MODE_LIVE]);
    log("positions joined (spectator, courtsider, session user, fighter A)");
  },
});

const id = BigInt(Date.now());
let proofsDone = false;
const proofs = async () => {
  const er = await env.er(spec);
  const { decodeMarket } = await import("@ringside/client");
  const m = decodeMarket((await er.getAccountInfo((await import("@ringside/client")).marketPda(id, MODE_LIVE)))!.data);
  const tick = m.lastPricedTick;
  const fill = await send(er, [await env.ix.trade(spec.publicKey, spec.publicKey, id, MODE_LIVE, tick, "A", "buy", 3n, m.askA + 20_000n, false)], [spec], { skipPreflight: true }).catch((e) => ({ sig: `err ${errorCode(e)}` }));
  links.trade_fill = tx(fill.sig);
  log(`fill ${fill.sig}`);
  const stale = await strict("stale", courtsider, () => env.ix.trade(courtsider.publicKey, courtsider.publicKey, id, MODE_LIVE, tick > 6n ? tick - 6n : 0n, "B", "buy", 2n, 1_000_000n, false), 6000);
  if (stale) links.stale_reject = tx(stale);
  const barred = await strict("fighter bar", fa, () => env.ix.trade(fa.publicKey, fa.publicKey, id, MODE_LIVE, tick, "A", "buy", 1n, 1_000_000n, false), 6001);
  if (barred) links.fighter_reject = tx(barred);
  try {
    const s = await makeSession(sessionUser);
    const m2 = decodeMarket((await er.getAccountInfo((await import("@ringside/client")).marketPda(id, MODE_LIVE)))!.data);
    const r = await send(await env.er(sessionUser), [await env.ix.trade(s.kp.publicKey, sessionUser.publicKey, id, MODE_LIVE, m2.lastPricedTick, "B", "buy", 1n, m2.askB + 30_000n, false, s.token)], [s.kp], { skipPreflight: true });
    links.session_trade = tx(r.sig);
    log(`session-key trade ${r.sig}`);
    spike.push(`5. Session key accepted on the ER: trade signed only by session key ${s.kp.publicKey.toBase58()} (token ${s.token.toBase58()}): ${tx(r.sig)}`);
  } catch (e) {
    spike.push(`5. Session-key trade failed: ${String((e as Error).message).split("\n")[0]}`);
    log(`session-key trade failed: ${String((e as Error).message).slice(0, 400)}`);
  }
  // E5: privacy reads against the courtsider's private Position while the match is live.
  try {
    console.log(execFileSync("npx", ["tsx", path.join(ROOT, "scripts/e5-privacy.ts"), id.toString(), "live", process.env.E5_N ?? "20"], { cwd: path.join(ROOT, "scripts"), encoding: "utf8" }));
  } catch (e) {
    log(`E5 live phase failed: ${String((e as Error).message).split("\n")[0]}`);
  }
  proofsDone = true;
};
runner.opts.onTick = (g) => {
  if (!proofsDone && g.tick >= 25 && (g.status === 1 || g.status === 2)) {
    proofsDone = true;
    void proofs();
  }
};

const t0 = Date.now();
const r = await runner.run(id);
log(`match ${id}: winner ${r.winner} at tick ${r.ticks} via ${r.crank} (${(Date.now() - t0) / 1000}s)`);

// E5 after the reveal.
try {
  console.log(execFileSync("npx", ["tsx", path.join(ROOT, "scripts/e5-privacy.ts"), id.toString(), "revealed", process.env.E5_N ?? "20"], { cwd: path.join(ROOT, "scripts"), encoding: "utf8" }));
} catch (e) {
  log(`E5 revealed phase failed: ${String((e as Error).message).split("\n")[0]}`);
}

// Find the VRF callback and settle transactions in the match's ER history.
const er = await env.er(admin);
const sigs = await er.getSignaturesForAddress(matchPda(id), { limit: 1000 }).catch(() => []);
let vrfCallback = "";
let settleSig = r.sigs.settle ?? "";
let firstTick = "";
for (const s of sigs.reverse()) {
  if (vrfCallback && settleSig && firstTick) break;
  const t = await er.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
  const logs = t?.meta?.logMessages ?? [];
  if (!vrfCallback && logs.some((l) => l.includes("Instruction: VrfCallback")) && !t?.meta?.err) vrfCallback = s.signature;
  if (!settleSig && logs.some((l) => l.includes("Instruction: Settle")) && logs.some((l) => l.includes("Program data:")) && !t?.meta?.err) settleSig = s.signature;
  if (!firstTick && logs.some((l) => l.includes("Instruction: Tick")) && !t?.meta?.err) firstTick = s.signature;
}
if (vrfCallback) links.vrf_callback = tx(vrfCallback);
if (settleSig) links.settle = tx(settleSig);
if (r.sigs.finalize) {
  links.finalize = tx(r.sigs.finalize);
  try {
    const commit = await GetCommitmentSignature(r.sigs.finalize, er);
    links.commit = tx(commit, false);
  } catch (e) {
    log(`commit signature lookup: ${(e as Error).message}`);
  }
}
if (r.recordWritten) links.match_record = addr(recordPda(id));
links.program = addr(PROGRAM_ID);
links.config = addr(configPda());
links.model = addr(modelPda(env.p.modelVersion));
links.match = addr(matchPda(id));
links.repo = "https://github.com/Prashant-thakur77/ringside";

const lp = path.join(ROOT, "docs/links.json");
const prev = fs.existsSync(lp) ? JSON.parse(fs.readFileSync(lp, "utf8")) : {};
fs.writeFileSync(lp, JSON.stringify({ ...prev, ...links, e2e_match_id: id.toString(), e2e_env: env.p.name }, null, 2));
log(`links: ${JSON.stringify(links, null, 1)}`);

spike.unshift(
  `# Capability spike (${env.p.name}, ${new Date().toISOString()})`,
  "",
  "Run with the production program instead of throwaway spike programs (decisions.md). Each line is evidence from match " + id + ".",
  "",
  `1. Delegation to the TEE validator + private Position (permission created on the ER, members = owner + house authority); reads by non-members and unauthenticated clients: see eval/data/e5-${env.p.name}.json. Reveal at settle: ${links.settle ?? "n/a"}.`,
  `2. Crank: \`schedule_tick\` on the ${env.p.name === "devnet" ? "TEE" : "local"} ER ${r.sigs.schedule_tick ? tx(r.sigs.schedule_tick) : "(not scheduled)"}; match advanced by: **${r.crank}** → Switch A = ${r.crank === "crank" ? "ER crank" : "keeper fallback"}. First crank tick: ${firstTick ? tx(firstTick) : "n/a"}. Cadence: eval/data/e3-${env.p.name}.json.`,
  `3. VRF on the ephemeral queue: request ${r.sigs.vrf_request ? tx(r.sigs.vrf_request) : "n/a"}, callback ${vrfCallback ? tx(vrfCallback) : "NOT OBSERVED"} → Switch B = ${vrfCallback ? "ephemeral-queue VRF" : "base-layer seed chain fallback"}.`,
  `4. Ephemeral SPL: stakes moved player eATA → match escrow (join ${r.sigs.join_a ? tx(r.sigs.join_a) : "n/a"}), PDA-signed payout at settle (${links.settle ?? "n/a"}), house vault funded by \`topup_house_vault\`.`,
);
fs.writeFileSync(path.join(ROOT, "docs/spike.md"), spike.join("\n") + "\n");
log("docs/spike.md written");
process.exit(0);
