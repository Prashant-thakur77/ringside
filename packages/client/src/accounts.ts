// Decoders for the zero-copy accounts (repr(C) layouts in programs/ringside/src/state.rs).
import { PublicKey } from "@solana/web3.js";

export const SIM_BYTES = 832;
const DISC = 8;

const pk = (b: Buffer, o: number) => new PublicKey(b.subarray(o, o + 32));
const u64 = (b: Buffer, o: number) => b.readBigUInt64LE(o);
const i64 = (b: Buffer, o: number) => b.readBigInt64LE(o);

export interface MatchAccount {
  matchId: bigint;
  stake: bigint;
  createdUnix: bigint;
  startUnix: bigint;
  startSlot: bigint;
  lastTickSlot: bigint;
  lastTickUnixMs: bigint;
  endUnix: bigint;
  inputSeq: [bigint, bigint];
  fighters: [PublicKey, PublicKey];
  fighterSessionSigners: [PublicKey, PublicKey];
  opponent: PublicKey;
  marketLive: PublicKey;
  marketDelayed: PublicKey;
  escrow: PublicKey;
  stateHash: Buffer;
  inputs: [number, number];
  status: number;
  winner: number;
  joined: number;
  vrfRequestedWave: number;
  vrfFulfilledWave: number;
  nVrf: number;
  finalized: number;
  aiFlags: number;
  sim: Buffer;
  tick: number;
}

export function decodeMatch(data: Buffer): MatchAccount {
  const b = data.subarray(DISC);
  const sim = Buffer.from(b.subarray(392, 392 + SIM_BYTES));
  return {
    matchId: u64(b, 0),
    stake: u64(b, 8),
    createdUnix: i64(b, 16),
    startUnix: i64(b, 24),
    startSlot: u64(b, 32),
    lastTickSlot: u64(b, 40),
    lastTickUnixMs: i64(b, 48),
    endUnix: i64(b, 56),
    inputSeq: [u64(b, 64), u64(b, 72)],
    fighters: [pk(b, 80), pk(b, 112)],
    fighterSessionSigners: [pk(b, 144), pk(b, 176)],
    opponent: pk(b, 208),
    marketLive: pk(b, 240),
    marketDelayed: pk(b, 272),
    escrow: pk(b, 304),
    stateHash: Buffer.from(b.subarray(336, 368)),
    inputs: [b.readUInt16LE(376), b.readUInt16LE(378)],
    status: b[380],
    winner: b[381],
    joined: b[383],
    vrfRequestedWave: b.readUInt16LE(384),
    vrfFulfilledWave: b.readUInt16LE(386),
    nVrf: b.readUInt16LE(388),
    finalized: b[390],
    aiFlags: b[391],
    sim,
    tick: sim.readUInt32LE(0),
  };
}

export interface MarketAccount {
  matchKey: PublicKey;
  matchId: bigint;
  fairP: number; // probability in [0, 1]
  lastPricedTick: bigint;
  mid: bigint;
  bidA: bigint;
  askA: bigint;
  bidB: bigint;
  askB: bigint;
  spread: bigint;
  invA: bigint;
  invB: bigint;
  houseCash: bigint;
  houseLiabilityA: bigint;
  houseLiabilityB: bigint;
  maxExposureSeen: bigint;
  cap: bigint;
  volume: bigint;
  nTrades: bigint;
  nRejectedStale: bigint;
  nRejectedFighter: bigint;
  nRejectedOther: bigint;
  feeAccrued: bigint;
  frozenUntilTick: bigint;
  claimedTotal: bigint;
  relayUnixMs: bigint;
  nPositions: number;
  delayMs: number;
  mode: number;
  status: number;
  winner: number;
}

export function decodeMarket(data: Buffer): MarketAccount {
  const b = data.subarray(DISC);
  return {
    matchKey: pk(b, 0),
    matchId: u64(b, 32),
    fairP: Number(i64(b, 40)) / 2 ** 32,
    lastPricedTick: u64(b, 48),
    mid: u64(b, 56),
    bidA: u64(b, 64),
    askA: u64(b, 72),
    bidB: u64(b, 80),
    askB: u64(b, 88),
    spread: u64(b, 96),
    invA: u64(b, 104),
    invB: u64(b, 112),
    houseCash: i64(b, 120),
    houseLiabilityA: u64(b, 128),
    houseLiabilityB: u64(b, 136),
    maxExposureSeen: u64(b, 144),
    cap: u64(b, 152),
    volume: u64(b, 160),
    nTrades: u64(b, 168),
    nRejectedStale: u64(b, 176),
    nRejectedFighter: u64(b, 184),
    nRejectedOther: u64(b, 192),
    feeAccrued: u64(b, 200),
    frozenUntilTick: u64(b, 208),
    claimedTotal: u64(b, 216),
    relayUnixMs: i64(b, 224),
    nPositions: b.readUInt32LE(232),
    delayMs: b.readUInt32LE(236),
    mode: b[285],
    status: b[286],
    winner: b[287],
  };
}
