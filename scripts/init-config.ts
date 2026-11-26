// Initializes (or updates) the global Config.
import { send } from "@ringside/client/node";
import { configPda } from "@ringside/client";
import { admin, env, log, relay } from "./common.ts";

const args = {
  feeBps: 100,
  tickMs: Number(process.env.TICK_MS ?? 100),
  staleTicksMax: 2,
  minSlotGap: Number(process.env.MIN_SLOT_GAP ?? 1),
  freezeTicks: 2,
  relayAuthority: relay.publicKey,
  spread: { sBase: 20_000, sVolBps: 5_000, sTime: 20_000, kSkew: 30_000, exposureCapPerMatch: Number(process.env.EXPOSURE_CAP ?? 60_000_000), maxQty: 25 },
};
const exists = await env.base.getAccountInfo(configPda());
const ix = exists ? await env.ix.updateConfig(admin.publicKey, args) : await env.ix.initializeConfig(admin.publicKey, args);
const r = await send(env.base, [ix], [admin]);
log(exists ? "config updated" : "config initialized", configPda().toBase58(), r.sig);
