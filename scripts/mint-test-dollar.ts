// Creates the self-minted devnet "test-dollar" (6 decimals) used for the house vault and bots
// when the Circle faucet cannot supply enough. Labeled as test-dollar in the UI and README.
import { createMint } from "@solana/spl-token";
import { readState, writeState } from "@ringside/client/node";
import { admin, env, log } from "./common.ts";

const st = readState(env.p.name);
if (st.mint && process.argv[2] !== "--force") {
  log("mint already set:", st.mint);
} else {
  const mint = await createMint(env.base, admin, admin.publicKey, null, 6);
  writeState(env.p.name, { mint: mint.toBase58(), mintKind: "test-dollar" });
  log("test-dollar mint:", mint.toBase58());
}
