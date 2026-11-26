// Node-only helpers for scripts and bots: environment profiles, keypairs, connections, sending.
import fs from "node:fs";
import path from "node:path";
import nacl from "tweetnacl";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type Commitment,
  type TransactionInstruction,
} from "@solana/web3.js";
import { delegateSpl } from "@magicblock-labs/ephemeral-rollups-sdk";
import { TeeSession } from "./tee.ts";
import { Ix, ringsideProgram } from "./program.ts";

export interface Profile {
  name: "local" | "devnet";
  baseRpc: string;
  erRpc: string;
  tee: boolean;
  validator: PublicKey;
  mint: PublicKey;
  modelVersion: number;
  vrfQueue: PublicKey;
  explorer: (sig: string, er?: boolean) => string;
}

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

export function loadKeypair(name: string): Keypair {
  const p = name.includes("/") ? name : path.join(ROOT, "keys", `${name}.json`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

export function ensureKeypair(name: string): Keypair {
  const p = path.join(ROOT, "keys", `${name}.json`);
  if (!fs.existsSync(p)) {
    const k = Keypair.generate();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(Array.from(k.secretKey)), { mode: 0o600 });
  }
  return loadKeypair(name);
}

/** Deployment state written by the setup scripts (mint, model version, house, etc.). */
export function readState(profile: string): Record<string, string> {
  const p = path.join(ROOT, "keys", `state-${profile}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}

export function writeState(profile: string, patch: Record<string, string>) {
  const p = path.join(ROOT, "keys", `state-${profile}.json`);
  fs.writeFileSync(p, JSON.stringify({ ...readState(profile), ...patch }, null, 2));
}

export function profile(name = process.env.RINGSIDE_ENV ?? "devnet"): Profile {
  const st = readState(name);
  if (name === "local") {
    return {
      name: "local",
      baseRpc: process.env.SOLANA_RPC ?? "http://127.0.0.1:8899",
      erRpc: process.env.ER_RPC ?? "http://127.0.0.1:7799",
      tee: false,
      validator: new PublicKey(process.env.ER_VALIDATOR ?? "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev"),
      mint: new PublicKey(st.mint ?? process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
      modelVersion: Number(st.modelVersion ?? 1),
      vrfQueue: new PublicKey(process.env.VRF_QUEUE ?? "Sc9MJUngNbQXSXGP3F67KvKwVnhaYn6kcioxXNVowYT"),
      explorer: (sig) => `local:${sig}`,
    };
  }
  return {
    name: "devnet",
    baseRpc: process.env.SOLANA_RPC ?? "https://api.devnet.solana.com",
    erRpc: process.env.TEE_RPC ?? "https://devnet-tee.magicblock.app",
    tee: true,
    validator: new PublicKey(process.env.TEE_VALIDATOR ?? "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo"),
    mint: new PublicKey(st.mint ?? process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
    modelVersion: Number(st.modelVersion ?? 1),
    vrfQueue: new PublicKey(process.env.VRF_QUEUE ?? "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc"),
    explorer: (sig, er) =>
      er
        ? `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent("https://devnet-tee.magicblock.app")}`
        : `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  };
}

export class Env {
  readonly base: Connection;
  private teeSessions = new Map<string, TeeSession>();
  private plainEr: Connection | null = null;
  readonly ix: Ix;

  constructor(readonly p: Profile, readonly commitment: Commitment = "confirmed") {
    this.base = new Connection(p.baseRpc, commitment);
    this.ix = new Ix(ringsideProgram(this.base), p.mint);
  }

  /** ER connection; on the TEE it is authenticated as `who` (token in the URL, auto-refreshed). */
  async er(who: Keypair): Promise<Connection> {
    if (!this.p.tee) {
      this.plainEr ??= new Connection(this.p.erRpc, { commitment: this.commitment, wsEndpoint: this.p.erRpc.replace(/^http/, "ws").replace(":7799", ":7800") });
      return this.plainEr;
    }
    const k = who.publicKey.toBase58();
    let s = this.teeSessions.get(k);
    if (!s) {
      s = new TeeSession(this.p.erRpc, who.publicKey, async (m) => nacl.sign.detached(m, who.secretKey), this.commitment);
      this.teeSessions.set(k, s);
    }
    return s.connection();
  }

  ata(owner: PublicKey) {
    return getAssociatedTokenAddressSync(this.p.mint, owner, true);
  }
}

export interface Sent {
  sig: string;
  ms: number;
  logs?: string[];
}

/** Signs and sends; waits for confirmation; returns signature and submit→confirm latency. */
export async function send(conn: Connection, ixs: TransactionInstruction[], signers: Keypair[], opts: { cu?: number; skipPreflight?: boolean } = {}): Promise<Sent> {
  const tx = new Transaction();
  if (opts.cu) tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: opts.cu }));
  tx.add(...ixs);
  const t0 = performance.now();
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: opts.skipPreflight ?? false, preflightCommitment: "confirmed" });
  const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  const ms = performance.now() - t0;
  if (res.value.err) {
    const info = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 1 }).catch(() => null);
    const e = new Error(`tx ${sig} failed: ${JSON.stringify(res.value.err)}\n${(info?.meta?.logMessages ?? []).join("\n")}`) as Error & { sig: string; logs: string[] };
    e.sig = sig;
    e.logs = info?.meta?.logMessages ?? [];
    throw e;
  }
  return { sig, ms };
}

/** Extracts the Anchor custom error code from a failed send (e.g. 6000 for ErrStaleTick). */
export function errorCode(e: unknown): number | null {
  const s = String((e as Error)?.message ?? e);
  const m = s.match(/"Custom":(\d+)/) ?? s.match(/custom program error: 0x([0-9a-f]+)/i);
  if (!m) return null;
  return m[0].includes("0x") ? parseInt(m[1], 16) : Number(m[1]);
}

/** Moves `amount` of the profile mint from the owner's base ATA into their ER balance. */
export async function depositToEr(env: Env, owner: Keypair, amount: bigint, payer: Keypair = owner): Promise<Sent> {
  const ixs = await delegateSpl(owner.publicKey, env.p.mint, amount, { payer: payer.publicKey, validator: env.p.validator, initIfMissing: true, initVaultIfMissing: true, initAtasIfMissing: true, idempotent: true });
  return send(env.base, [createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, env.ata(owner.publicKey), owner.publicKey, env.p.mint), ...ixs], payer === owner ? [owner] : [payer, owner]);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
