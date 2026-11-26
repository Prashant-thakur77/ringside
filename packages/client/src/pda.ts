import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, PERMISSION_PROGRAM, EPHEMERAL_SPL_PROGRAM } from "./constants.ts";

const u64 = (n: bigint | number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};
const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const find = (seeds: (Buffer | Uint8Array)[], program = PROGRAM_ID) => PublicKey.findProgramAddressSync(seeds, program)[0];

export const configPda = () => find([Buffer.from("config")]);
export const modelPda = (version: number) => find([Buffer.from("model"), u16(version)]);
export const profilePda = (wallet: PublicKey) => find([Buffer.from("profile"), wallet.toBuffer()]);
export const matchPda = (id: bigint | number) => find([Buffer.from("match"), u64(id)]);
export const marketPda = (id: bigint | number, mode: number) => find([Buffer.from("market"), u64(id), Buffer.from([mode])]);
export const positionPda = (market: PublicKey, owner: PublicKey) => find([Buffer.from("pos"), market.toBuffer(), owner.toBuffer()]);
export const recordPda = (id: bigint | number) => find([Buffer.from("record"), u64(id)]);
export const permissionPda = (account: PublicKey) => find([Buffer.from("permission:"), account.toBuffer()], PERMISSION_PROGRAM);
export const eataPda = (owner: PublicKey, mint: PublicKey) => find([owner.toBuffer(), mint.toBuffer()], EPHEMERAL_SPL_PROGRAM);
