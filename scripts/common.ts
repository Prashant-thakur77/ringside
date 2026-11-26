import { Env, profile, ensureKeypair, loadKeypair } from "@ringside/client/node";
export { configPda, modelPda, profilePda, matchPda, marketPda } from "@ringside/client";

export const env = new Env(profile());
export const admin = loadKeypair(process.env.ADMIN_KEYPAIR ?? "admin");
export const relay = ensureKeypair("relay");
export const BOT_NAMES = ["fighter-a", "fighter-b", "spec-1", "spec-2", "spec-3", "spec-4", "courtsider", "keeper", "relay"];
export const log = (...a: unknown[]) => console.log(`[${env.p.name}]`, ...a);
