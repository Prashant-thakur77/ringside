// Prints a token-authenticated TEE RPC URL for a keypair (for tools like hydra-cranker).
// Usage: tsx scripts/tee-url.ts <keypair-name>
import { Env, loadKeypair, profile } from "@ringside/client/node";
const env = new Env(profile("devnet"));
const er = await env.er(loadKeypair(process.argv[2] ?? "cranker"));
console.log(er.rpcEndpoint);
process.exit(0);
