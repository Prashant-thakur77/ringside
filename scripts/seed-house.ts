// Seeds the house vault: deposits admin funds into the ER, creates + delegates the house eATA
// (owned by the Config PDA) and tops it up on the ER.
import { createAssociatedTokenAccountIdempotentInstruction, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { depositToEr, readState, send, sleep } from "@ringside/client/node";
import { configPda, eataPda } from "@ringside/client";
import { admin, env, log } from "./common.ts";

const amount = BigInt(process.env.HOUSE_AMOUNT ?? 500_000_000); // 500 test-dollars
const st = readState(env.p.name);
const adminAta = await getOrCreateAssociatedTokenAccount(env.base, admin, env.p.mint, admin.publicKey);
if (st.mintKind === "test-dollar" && adminAta.amount < amount) {
  log("mint test-dollars", await mintTo(env.base, admin, env.p.mint, adminAta.address, admin, amount * 3n));
}
log("admin deposit to ER", (await depositToEr(env, admin, amount)).sig);
const houseEata = eataPda(configPda(), env.p.mint);
if (!(await env.base.getAccountInfo(houseEata))) {
  log("init_house_vault", (await send(env.base, [await env.ix.initHouseVault(admin.publicKey, env.p.validator)], [admin])).sig);
}
// The ER projects the eATA balance onto the canonical ATA, which must exist on the base layer.
log("house ATA", (await send(env.base, [createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, env.ix.houseToken(), configPda(), env.p.mint)], [admin])).sig);
const er = await env.er(admin);
for (let i = 0; i < 30 && !(await er.getAccountInfo(env.ix.houseToken())); i++) await sleep(1000);
for (let i = 0; i < 60; i++) {
  const bal = await getAccount(er, env.ata(admin.publicKey)).then((a) => a.amount).catch(() => 0n);
  if (bal >= amount) break;
  await sleep(1000);
}
log("topup_house_vault", (await send(er, [await env.ix.topupHouseVault(admin.publicKey, amount)], [admin])).sig);
const house = await getAccount(er, env.ix.houseToken());
log("house vault on ER:", house.address.toBase58(), "balance", house.amount.toString());
