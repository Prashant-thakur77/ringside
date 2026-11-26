"use client";
// Spectator / fighter onboarding and trading from the browser.
//  1. TEE pass: sign a challenge → token-authenticated ER connection (token only in the URL).
//  2. Fund + join: one base-layer transaction: deposit into the ER (eSPL) and create + delegate
//     the Position for this match's book.
//  3. Session: a 2-hour session key scoped to Ringside, plus a capped token approval on the ER.
//  4. Trade: signed by the session key, no wallet prompt.
import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { SessionTokenManager } from "@magicblock-labs/gum-sdk";
import { createApproveInstruction, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { delegateSpl } from "@magicblock-labs/ephemeral-rollups-sdk";
import { Ix, ringsideProgram, marketPda, positionPda, PROGRAM_ID, SESSION_KEYS_PROGRAM, TeeSession, TEE_VALIDATOR, USDC_MINT } from "@ringside/client";
import { createContext, createElement, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ER_RPC, SOLANA_RPC } from "./config";

const MINT = new PublicKey(process.env.NEXT_PUBLIC_MINT ?? USDC_MINT.toBase58());
const VALIDATOR = new PublicKey(process.env.NEXT_PUBLIC_ER_VALIDATOR ?? TEE_VALIDATOR.toBase58());
const IS_TEE = !ER_RPC.includes("127.0.0.1") && !ER_RPC.includes("localhost");

export type Step = "connect" | "pass" | "fund" | "session" | "ready";
export interface TradeResult {
  ok: boolean;
  sig?: string;
  ms: number;
  code?: number | null;
  seenTick: bigint;
  price?: bigint;
  qty: bigint;
  side: "A" | "B";
}

const codeOf = (e: unknown) => {
  const s = String((e as Error)?.message ?? e);
  const m = s.match(/"Custom":(\d+)/) ?? s.match(/custom program error: 0x([0-9a-f]+)/i);
  return m ? (m[0].includes("0x") ? parseInt(m[1], 16) : Number(m[1])) : null;
};

function useTraderState() {
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const [session, setSession] = useState<{ kp: Keypair; token: PublicKey; validUntil: number } | null>(null);
  const base = useMemo(() => new Connection(SOLANA_RPC, "confirmed"), []);
  const ix = useMemo(() => new Ix(ringsideProgram(base), MINT), [base]);
  const tee = useRef<TeeSession | null>(null);
  const [er, setEr] = useState<Connection | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState(false);

  const pk = wallet.publicKey;
  const step: Step = !pk ? "connect" : !er ? "pass" : !session || !approved ? (joined.size ? "session" : "fund") : "ready";
  const signWithSession = async (t: Transaction) => {
    t.partialSign(session!.kp);
    return t;
  };

  const sendWith = async (conn: Connection, ixs: TransactionInstruction[], feePayer: PublicKey, sign: (t: Transaction) => Promise<Transaction>) => {
    const t0 = performance.now();
    const tx = new Transaction().add(...ixs);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayer;
    const signed = await sign(tx);
    const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    const r = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (r.value.err) throw Object.assign(new Error(JSON.stringify(r.value.err)), { sig });
    return { sig, ms: performance.now() - t0 };
  };

  const run = async <T,>(label: string, f: () => Promise<T>) => {
    setBusy(label);
    setError(null);
    try {
      return await f();
    } catch (e) {
      setError(String((e as Error).message ?? e).slice(0, 220));
      throw e;
    } finally {
      setBusy(null);
    }
  };

  const getPass = useCallback(
    () =>
      run("Signing the TEE pass", async () => {
        if (!pk || !wallet.signMessage) throw new Error("wallet cannot sign messages");
        if (!IS_TEE) {
          setEr(new Connection(ER_RPC, "confirmed"));
          return;
        }
        tee.current = new TeeSession(ER_RPC, pk, wallet.signMessage);
        setEr(await tee.current.connection());
      }),
    [pk, wallet.signMessage],
  );

  const fundAndJoin = useCallback(
    (matchId: bigint, amount: bigint, mode = 0) =>
      run("Funding and joining", async () => {
        if (!pk || !wallet.signTransaction || !er) throw new Error("connect first");
        const market = marketPda(matchId, mode);
        const ixs: TransactionInstruction[] = [createAssociatedTokenAccountIdempotentInstruction(pk, getAssociatedTokenAddressSync(MINT, pk), pk, MINT)];
        if (amount > 0n) ixs.push(...(await delegateSpl(pk, MINT, amount, { payer: pk, validator: VALIDATOR, initIfMissing: true, initVaultIfMissing: true, initAtasIfMissing: true, idempotent: true })));
        if (!(await base.getAccountInfo(positionPda(market, pk)))) ixs.push(await ix.joinPosition(pk, pk, market), await ix.delegatePosition(pk, pk, market, VALIDATOR));
        if (ixs.length > 1) await sendWith(base, ixs, pk, wallet.signTransaction!);
        const pos = positionPda(market, pk);
        for (let i = 0; i < 40 && !(await er.getAccountInfo(pos).catch(() => null)); i++) await new Promise((r) => setTimeout(r, 500));
        await sendWith(er, [await ix.initPositionPermission(pk, pos)], pk, wallet.signTransaction!).catch(() => null);
        setJoined((s) => new Set(s).add(`${matchId}:${mode}`));
      }),
    [pk, wallet.signTransaction, er, base, ix],
  );

  /** Fighters only need ER funds (no position). */
  const fund = useCallback(
    (amount: bigint) =>
      run("Funding your stake", async () => {
        if (!pk || !wallet.signTransaction || !er) throw new Error("connect first");
        const ixs: TransactionInstruction[] = [createAssociatedTokenAccountIdempotentInstruction(pk, getAssociatedTokenAddressSync(MINT, pk), pk, MINT)];
        ixs.push(...(await delegateSpl(pk, MINT, amount, { payer: pk, validator: VALIDATOR, initIfMissing: true, initVaultIfMissing: true, initAtasIfMissing: true, idempotent: true })));
        await sendWith(base, ixs, pk, wallet.signTransaction!);
        setJoined((s) => new Set(s).add("funded"));
      }),
    [pk, wallet.signTransaction, er, base],
  );

  const startSession = useCallback(
    (cap: bigint) =>
      run("Starting a 2-hour session", async () => {
        if (!pk || !wallet.signTransaction || !er || !anchorWallet) throw new Error("connect first");
        // Session key V2 scoped to Ringside, valid 2 h, small SOL top-up for its fees.
        const kp = Keypair.generate();
        const validUntil = Math.floor(Date.now() / 1000) + 2 * 3600;
        const token = PublicKey.findProgramAddressSync(
          [Buffer.from("session_token_v2"), PROGRAM_ID.toBuffer(), kp.publicKey.toBuffer(), pk.toBuffer()],
          SESSION_KEYS_PROGRAM,
        )[0];
        const mgr = new SessionTokenManager(anchorWallet, base);
        const ix = await mgr.program.methods
          .createSessionV2(true, new BN(validUntil), new BN(10_000_000))
          .accounts({ sessionToken: token, sessionSigner: kp.publicKey, feePayer: pk, authority: pk, targetProgram: PROGRAM_ID } as never)
          .instruction();
        await sendWith(base, [ix], pk, async (t) => {
          t.partialSign(kp);
          return wallet.signTransaction!(t);
        });
        // The session key may move up to `cap` of the user's ER balance (SPL delegate allowance).
        await sendWith(er, [createApproveInstruction(getAssociatedTokenAddressSync(MINT, pk), kp.publicKey, pk, cap)], pk, wallet.signTransaction!);
        setSession({ kp, token, validUntil });
        setApproved(true);
      }),
    [pk, wallet.signTransaction, er, anchorWallet, base],
  );

  const trade = useCallback(
    async (matchId: bigint, mode: number, seenTick: bigint, side: "A" | "B", dir: "buy" | "sell", qty: bigint, limit: bigint): Promise<TradeResult> => {
      if (!pk || !er || !session) throw new Error("not ready");
      const t0 = performance.now();
      try {
        const i = await ix.trade(session.kp.publicKey, pk, matchId, mode, seenTick, side, dir, qty, limit, false, session.token);
        const r = await sendWith(er, [i], session.kp.publicKey, signWithSession);
        return { ok: true, sig: r.sig, ms: r.ms, seenTick, qty, side, price: limit };
      } catch (e) {
        return { ok: false, sig: (e as { sig?: string }).sig, ms: performance.now() - t0, code: codeOf(e), seenTick, qty, side };
      }
    },
    [pk, er, session, ix],
  );

  /** Fighter path: join a match and stream inputs through the session key. */
  const joinFight = useCallback(
    (matchId: bigint) =>
      run("Joining the fight", async () => {
        if (!pk || !er || !session) throw new Error("start a session first");
        await sendWith(er, [await ix.joinFight(session.kp.publicKey, pk, matchId, session.token)], session.kp.publicKey, signWithSession);
      }),
    [pk, er, session, ix],
  );
  const seq = useRef(0n);
  const sendInput = useCallback(
    async (matchId: bigint, bits: number) => {
      if (!pk || !er || !session) return;
      seq.current += 1n;
      const i = await ix.submitInput(session.kp.publicKey, pk, matchId, seq.current, bits, session.token);
      const tx = new Transaction().add(i);
      tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
      tx.feePayer = session.kp.publicKey;
      const signed = await signWithSession(tx);
      er.sendRawTransaction(signed.serialize(), { skipPreflight: true }).catch(() => {});
    },
    [pk, er, session, ix],
  );

  return { step, busy, error, er, getPass, fund, fundAndJoin, startSession, trade, joinFight, sendInput, joined, pk, sessionKey: session?.kp.publicKey ?? null };
}

type Trader = ReturnType<typeof useTraderState>;
const Ctx = createContext<Trader | null>(null);

/** One trader per app: the TEE connection, session and onboarding state are shared. */
export function TraderProvider({ children }: { children: ReactNode }) {
  const t = useTraderState();
  return createElement(Ctx.Provider, { value: t }, children);
}

export function useTrader(): Trader {
  const t = useContext(Ctx);
  if (!t) throw new Error("useTrader outside TraderProvider");
  return t;
}
