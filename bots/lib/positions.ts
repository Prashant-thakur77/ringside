// Spectator onboarding for a match: Position PDA created + delegated on base, made private on the ER.
import type { Keypair } from "@solana/web3.js";
import { marketPda, MODE_DELAYED, MODE_LIVE, positionPda } from "@ringside/client";
import { type Env, send } from "@ringside/client/node";

export async function joinPositions(env: Env, payer: Keypair, who: Keypair, id: bigint, modes = [MODE_LIVE, MODE_DELAYED]) {
  const sigs: string[] = [];
  for (const mode of modes) {
    const market = marketPda(id, mode);
    const pos = positionPda(market, who.publicKey);
    if (!(await env.base.getAccountInfo(pos))) {
      sigs.push((await send(env.base, [await env.ix.joinPosition(payer.publicKey, who.publicKey, market), await env.ix.delegatePosition(payer.publicKey, who.publicKey, market, env.p.validator)], [payer])).sig);
    }
    const er = await env.er(payer);
    for (let i = 0; i < 40 && !(await er.getAccountInfo(pos).catch(() => null)); i++) await new Promise((r) => setTimeout(r, 500));
    try {
      sigs.push((await send(er, [await env.ix.initPositionPermission(payer.publicKey, pos)], [payer])).sig);
    } catch {
      /* already private */
    }
  }
  return sigs;
}
