// Instruction builders for every Ringside instruction, with all accounts resolved explicitly.
import anchorPkg from "@coral-xyz/anchor";
import type { Program, Wallet } from "@coral-xyz/anchor";
const { AnchorProvider, BN } = anchorPkg;
const ProgramCtor = anchorPkg.Program;
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_SLOT_HASHES_PUBKEY,
  type TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import idlJson from "./idl/ringside.json" with { type: "json" };
import type { Ringside } from "./idl/ringside-types.ts";
import {
  DELEGATION_PROGRAM,
  EPHEMERAL_SPL_PROGRAM,
  EPHEMERAL_VAULT,
  MAGIC_CONTEXT,
  MAGIC_PROGRAM,
  MODE_DELAYED,
  MODE_LIVE,
  PERMISSION_PROGRAM,
  PROGRAM_ID,
  VRF_EPHEMERAL_QUEUE,
  VRF_PROGRAM,
} from "./constants.ts";
import { configPda, eataPda, marketPda, matchPda, modelPda, permissionPda, positionPda, profilePda, recordPda } from "./pda.ts";

export const IDL = idlJson as unknown as Ringside;

class ReadonlyWallet implements Wallet {
  constructor(readonly payer: Keypair = Keypair.generate()) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  async signTransaction<T>(tx: T): Promise<T> {
    return tx;
  }
  async signAllTransactions<T>(txs: T[]): Promise<T[]> {
    return txs;
  }
}

/** A Program used only to build instructions (signing happens elsewhere). */
export function ringsideProgram(connection: Connection): Program<Ringside> {
  const provider = new AnchorProvider(connection, new ReadonlyWallet(), { commitment: "confirmed" });
  return new ProgramCtor<Ringside>({ ...IDL, address: PROGRAM_ID.toBase58() } as Ringside, provider);
}

const ata = (owner: PublicKey, mint: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);
const dlpBuffer = (acc: PublicKey, owner: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("buffer"), acc.toBuffer()], owner)[0];
const dlpRecord = (acc: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("delegation"), acc.toBuffer()], DELEGATION_PROGRAM)[0];
const dlpMeta = (acc: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("delegation-metadata"), acc.toBuffer()], DELEGATION_PROGRAM)[0];
const validatorMeta = (v: PublicKey): AccountMeta => ({ pubkey: v, isSigner: false, isWritable: false });

/** Scoped VRF requester identity: PDA ["identity"] under this program. */
export const vrfIdentity = () => PublicKey.findProgramAddressSync([Buffer.from("identity")], PROGRAM_ID)[0];

export interface ConfigArgs {
  feeBps: number;
  tickMs: number;
  staleTicksMax: number;
  minSlotGap: number;
  freezeTicks: number;
  relayAuthority: PublicKey;
  spread: { sBase: number; sVolBps: number; sTime: number; kSkew: number; exposureCapPerMatch: number; maxQty: number };
}

const spreadArgs = (s: ConfigArgs["spread"]) => ({
  sBase: new BN(s.sBase),
  sVolBps: new BN(s.sVolBps),
  sTime: new BN(s.sTime),
  kSkew: new BN(s.kSkew),
  exposureCapPerMatch: new BN(s.exposureCapPerMatch),
  maxQty: new BN(s.maxQty),
});
const configArgs = (a: ConfigArgs) => ({ ...a, spread: spreadArgs(a.spread) });

export class Ix {
  constructor(readonly program: Program<Ringside>, readonly mint: PublicKey) {}

  get config() {
    return configPda();
  }
  houseToken() {
    return ata(configPda(), this.mint);
  }

  // ── base layer ──
  initializeConfig(admin: PublicKey, args: ConfigArgs) {
    return this.program.methods.initializeConfig(configArgs(args)).accountsStrict({ admin, config: this.config, usdcMint: this.mint, systemProgram: SystemProgram.programId }).instruction();
  }
  updateConfig(admin: PublicKey, args: ConfigArgs) {
    return this.program.methods.updateConfig(configArgs(args)).accountsStrict({ admin, config: this.config }).instruction();
  }
  pause(admin: PublicKey, paused: boolean) {
    return this.program.methods.pause(paused).accountsStrict({ admin, config: this.config }).instruction();
  }
  setSpreadParams(admin: PublicKey, s: ConfigArgs["spread"]) {
    return this.program.methods.setSpreadParams(spreadArgs(s)).accountsStrict({ admin, config: this.config }).instruction();
  }
  initHouseVault(admin: PublicKey, validator: PublicKey) {
    const houseEata = eataPda(this.config, this.mint);
    return this.program.methods
      .initHouseVault()
      .accountsStrict({
        admin,
        config: this.config,
        usdcMint: this.mint,
        houseEata,
        eataBuffer: dlpBuffer(houseEata, EPHEMERAL_SPL_PROGRAM),
        eataRecord: dlpRecord(houseEata),
        eataMetadata: dlpMeta(houseEata),
        ephemeralTokenProgram: EPHEMERAL_SPL_PROGRAM,
        delegationProgram: DELEGATION_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([validatorMeta(validator)])
      .instruction();
  }
  createModel(admin: PublicKey, version: number) {
    return this.program.methods.createModel(version).accountsStrict({ admin, config: this.config, model: modelPda(version), systemProgram: SystemProgram.programId }).instruction();
  }
  setModelParams(admin: PublicKey, version: number, offset: number, chunk: Buffer) {
    return this.program.methods.setModelParams(version, offset, chunk).accountsStrict({ admin, config: this.config, model: modelPda(version) }).instruction();
  }
  finalizeModel(admin: PublicKey, version: number, metricsHash: number[]) {
    return this.program.methods.finalizeModel(version, metricsHash).accountsStrict({ admin, config: this.config, model: modelPda(version) }).instruction();
  }
  createProfile(payer: PublicKey, wallet: PublicKey) {
    return this.program.methods.createProfile().accountsStrict({ payer, wallet, profile: profilePda(wallet), systemProgram: SystemProgram.programId }).instruction();
  }
  delegateProfile(payer: PublicKey, wallet: PublicKey, validator: PublicKey) {
    const profile = profilePda(wallet);
    return this.program.methods
      .delegateProfile()
      .accountsStrict({
        payer,
        wallet,
        bufferProfile: dlpBuffer(profile, PROGRAM_ID),
        delegationRecordProfile: dlpRecord(profile),
        delegationMetadataProfile: dlpMeta(profile),
        profile,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([validatorMeta(validator)])
      .instruction();
  }
  createMatch(creator: PublicKey, id: bigint, stake: bigint, opponent: PublicKey, delayMs: number) {
    const game = matchPda(id);
    return this.program.methods
      .createMatch(new BN(id.toString()), new BN(stake.toString()), opponent, delayMs)
      .accountsStrict({
        creator,
        config: this.config,
        game,
        marketLive: marketPda(id, MODE_LIVE),
        marketDelayed: marketPda(id, MODE_DELAYED),
        record: recordPda(id),
        usdcMint: this.mint,
        escrowEata: eataPda(game, this.mint),
        ephemeralTokenProgram: EPHEMERAL_SPL_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }
  delegateMatch(payer: PublicKey, id: bigint, validator: PublicKey) {
    const game = matchPda(id);
    const ml = marketPda(id, MODE_LIVE);
    const md = marketPda(id, MODE_DELAYED);
    return this.program.methods
      .delegateMatch(new BN(id.toString()))
      .accountsStrict({
        payer,
        bufferGame: dlpBuffer(game, PROGRAM_ID),
        delegationRecordGame: dlpRecord(game),
        delegationMetadataGame: dlpMeta(game),
        game,
        bufferMarketLive: dlpBuffer(ml, PROGRAM_ID),
        delegationRecordMarketLive: dlpRecord(ml),
        delegationMetadataMarketLive: dlpMeta(ml),
        marketLive: ml,
        bufferMarketDelayed: dlpBuffer(md, PROGRAM_ID),
        delegationRecordMarketDelayed: dlpRecord(md),
        delegationMetadataMarketDelayed: dlpMeta(md),
        marketDelayed: md,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([validatorMeta(validator)])
      .instruction();
  }
  delegateEscrow(payer: PublicKey, id: bigint, validator: PublicKey) {
    const game = matchPda(id);
    const e = eataPda(game, this.mint);
    return this.program.methods
      .delegateEscrow(new BN(id.toString()))
      .accountsStrict({
        payer,
        config: this.config,
        game,
        escrowEata: e,
        eataBuffer: dlpBuffer(e, EPHEMERAL_SPL_PROGRAM),
        eataRecord: dlpRecord(e),
        eataMetadata: dlpMeta(e),
        ephemeralTokenProgram: EPHEMERAL_SPL_PROGRAM,
        delegationProgram: DELEGATION_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([validatorMeta(validator)])
      .instruction();
  }
  joinPosition(payer: PublicKey, owner: PublicKey, market: PublicKey) {
    return this.program.methods.joinPosition().accountsStrict({ payer, owner, market, position: positionPda(market, owner), systemProgram: SystemProgram.programId }).instruction();
  }
  delegatePosition(payer: PublicKey, owner: PublicKey, market: PublicKey, validator: PublicKey) {
    const position = positionPda(market, owner);
    return this.program.methods
      .delegatePosition()
      .accountsStrict({
        payer,
        owner,
        market,
        bufferPosition: dlpBuffer(position, PROGRAM_ID),
        delegationRecordPosition: dlpRecord(position),
        delegationMetadataPosition: dlpMeta(position),
        position,
        ownerProgram: PROGRAM_ID,
        delegationProgram: DELEGATION_PROGRAM,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([validatorMeta(validator)])
      .instruction();
  }

  // ── ephemeral rollup ──
  initPositionPermission(payer: PublicKey, position: PublicKey) {
    return this.program.methods
      .initPositionPermission()
      .accountsStrict({ payer, config: this.config, position, permission: permissionPda(position), permissionProgram: PERMISSION_PROGRAM, ephemeralVault: EPHEMERAL_VAULT, magicProgram: MAGIC_PROGRAM })
      .instruction();
  }
  joinFight(signer: PublicKey, player: PublicKey, id: bigint, sessionToken: PublicKey | null = null) {
    const game = matchPda(id);
    return this.program.methods
      .joinFight(new BN(id.toString()))
      .accountsStrict({ signer, player, config: this.config, game, playerToken: ata(player, this.mint), escrowToken: ata(game, this.mint), tokenProgram: TOKEN_PROGRAM_ID, sessionToken })
      .instruction();
  }
  submitInput(signer: PublicKey, player: PublicKey, id: bigint, seq: bigint, bits: number, sessionToken: PublicKey | null = null) {
    return this.program.methods.submitInput(new BN(id.toString()), new BN(seq.toString()), bits).accountsStrict({ signer, player, game: matchPda(id), sessionToken }).instruction();
  }
  tick(id: bigint, modelVersion: number) {
    return this.program.methods
      .tick(new BN(id.toString()))
      .accountsStrict({ config: this.config, model: modelPda(modelVersion), game: matchPda(id), marketLive: marketPda(id, MODE_LIVE) })
      .instruction();
  }
  requestWave(payer: PublicKey, id: bigint, queue = VRF_EPHEMERAL_QUEUE) {
    return this.program.methods
      .requestWaveRandomness(new BN(id.toString()))
      .accountsStrict({ payer, game: matchPda(id), oracleQueue: queue, programIdentity: vrfIdentity(), vrfProgram: VRF_PROGRAM, slotHashes: SYSVAR_SLOT_HASHES_PUBKEY, systemProgram: SystemProgram.programId })
      .instruction();
  }
  trade(
    signer: PublicKey,
    trader: PublicKey,
    id: bigint,
    mode: number,
    seenTick: bigint,
    side: "A" | "B",
    dir: "buy" | "sell",
    qty: bigint,
    limitPrice: bigint,
    recordRejects: boolean,
    sessionToken: PublicKey | null = null,
  ) {
    const market = marketPda(id, mode);
    return this.program.methods
      .trade(
        new BN(id.toString()),
        new BN(seenTick.toString()),
        side === "A" ? { a: {} } : { b: {} },
        dir === "buy" ? { buy: {} } : { sell: {} },
        new BN(qty.toString()),
        new BN(limitPrice.toString()),
        recordRejects,
      )
      .accountsStrict({
        signer,
        trader,
        config: this.config,
        game: matchPda(id),
        market,
        position: positionPda(market, trader),
        traderToken: ata(trader, this.mint),
        houseToken: this.houseToken(),
        tokenProgram: TOKEN_PROGRAM_ID,
        sessionToken,
      })
      .instruction();
  }
  relayDelayedState(relay: PublicKey, id: bigint, modelVersion: number, tick: bigint, features: bigint[], timeLeftMs: number, lethal: boolean) {
    return this.program.methods
      .relayDelayedState(new BN(id.toString()), new BN(tick.toString()), features.map((f) => new BN(f.toString())), timeLeftMs, lethal)
      .accountsStrict({ relay, config: this.config, model: modelPda(modelVersion), marketDelayed: marketPda(id, MODE_DELAYED) })
      .instruction();
  }
  private settleAccounts(id: bigint, fighters: [PublicKey, PublicKey]) {
    const game = matchPda(id);
    return {
      config: this.config,
      game,
      marketLive: marketPda(id, MODE_LIVE),
      marketDelayed: marketPda(id, MODE_DELAYED),
      escrowToken: ata(game, this.mint),
      fighterAToken: ata(fighters[0], this.mint),
      fighterBToken: ata(fighters[1], this.mint),
      houseToken: this.houseToken(),
      profileA: profilePda(fighters[0]),
      profileB: profilePda(fighters[1]),
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  }
  settle(id: bigint, fighters: [PublicKey, PublicKey], positions: PublicKey[] = []) {
    return this.program.methods
      .settle(new BN(id.toString()))
      .accountsStrict({ ...this.settleAccounts(id, fighters), permissionProgram: PERMISSION_PROGRAM, ephemeralVault: EPHEMERAL_VAULT, magicProgram: MAGIC_PROGRAM })
      .remainingAccounts(positions.flatMap((p) => [{ pubkey: p, isSigner: false, isWritable: true }, { pubkey: permissionPda(p), isSigner: false, isWritable: true }]))
      .instruction();
  }
  revealPositions(id: bigint, positions: PublicKey[]) {
    return this.program.methods
      .revealPositions(new BN(id.toString()))
      .accountsStrict({ config: this.config, game: matchPda(id), permissionProgram: PERMISSION_PROGRAM, ephemeralVault: EPHEMERAL_VAULT, magicProgram: MAGIC_PROGRAM })
      .remainingAccounts(positions.flatMap((p) => [{ pubkey: p, isSigner: false, isWritable: true }, { pubkey: permissionPda(p), isSigner: false, isWritable: true }]))
      .instruction();
  }
  claim(id: bigint, mode: number, owner: PublicKey) {
    const market = marketPda(id, mode);
    return this.program.methods
      .claim(new BN(id.toString()))
      .accountsStrict({ config: this.config, market, position: positionPda(market, owner), ownerToken: ata(owner, this.mint), houseToken: this.houseToken(), tokenProgram: TOKEN_PROGRAM_ID })
      .instruction();
  }
  finalize(payer: PublicKey, id: bigint) {
    return this.program.methods
      .finalize(new BN(id.toString()))
      .accountsStrict({
        payer,
        game: matchPda(id),
        marketLive: marketPda(id, MODE_LIVE),
        marketDelayed: marketPda(id, MODE_DELAYED),
        record: recordPda(id),
        programId: PROGRAM_ID,
        magicProgram: MAGIC_PROGRAM,
        magicContext: MAGIC_CONTEXT,
      })
      .instruction();
  }
  cleanupPositions(payer: PublicKey, id: bigint, positions: PublicKey[]) {
    return this.program.methods
      .cleanupPositions(new BN(id.toString()))
      .accountsStrict({ payer, game: matchPda(id), magicProgram: MAGIC_PROGRAM, magicContext: MAGIC_CONTEXT })
      .remainingAccounts(positions.map((p) => ({ pubkey: p, isSigner: false, isWritable: true })))
      .instruction();
  }
  scheduleTick(payer: PublicKey, id: bigint, modelVersion: number, fighters: [PublicKey, PublicKey], intervalMs: number, iterations: number) {
    const s = this.settleAccounts(id, fighters);
    return this.program.methods
      .scheduleTick(new BN(id.toString()), new BN(intervalMs), new BN(iterations))
      .accountsStrict({
        payer,
        magicProgram: MAGIC_PROGRAM,
        program: PROGRAM_ID,
        config: s.config,
        model: modelPda(modelVersion),
        game: s.game,
        marketLive: s.marketLive,
        marketDelayed: s.marketDelayed,
        escrowToken: s.escrowToken,
        fighterAToken: s.fighterAToken,
        fighterBToken: s.fighterBToken,
        houseToken: s.houseToken,
        profileA: s.profileA,
        profileB: s.profileB,
        tokenProgram: TOKEN_PROGRAM_ID,
        permissionProgram: PERMISSION_PROGRAM,
        ephemeralVault: EPHEMERAL_VAULT,
      })
      .instruction();
  }
  topupHouseVault(admin: PublicKey, amount: bigint) {
    return this.program.methods
      .topupHouseVault(new BN(amount.toString()))
      .accountsStrict({ admin, config: this.config, adminToken: ata(admin, this.mint), houseToken: this.houseToken(), tokenProgram: TOKEN_PROGRAM_ID })
      .instruction();
  }
  withdrawFees(admin: PublicKey, id: bigint) {
    return this.program.methods
      .withdrawFees(new BN(id.toString()))
      .accountsStrict({ admin, config: this.config, marketLive: marketPda(id, MODE_LIVE), adminToken: ata(admin, this.mint), houseToken: this.houseToken(), tokenProgram: TOKEN_PROGRAM_ID })
      .instruction();
  }
}

export type { TransactionInstruction };
