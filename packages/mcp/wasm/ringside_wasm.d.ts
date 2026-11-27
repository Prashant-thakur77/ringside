/* tslint:disable */
/* eslint-disable */

/**
 * Scripted fighter usable from TypeScript bots.
 */
export class ScriptedBot {
    free(): void;
    [Symbol.dispose](): void;
    act(state_bytes: Uint8Array | number[], me: number): number;
    /**
     * policy: 0 aggressive, 1 kiting, 2 defensive, 3 random. skill: 0..=1000.
     */
    constructor(policy: number, skill: number, seed: bigint);
}

/**
 * Discrete policy action (0..72) → input bits for fighter `me`.
 */
export function actionToInput(state_bytes: Uint8Array | number[], me: number, action: number): number;

/**
 * Direction index (0..16) toward (dx, dy).
 */
export function aimAt(dx: number, dy: number): number;

/**
 * Final hash of determinism episode `episode` (same generator as native and Python).
 */
export function determinismEpisodeHash(episode: bigint): Uint8Array;

/**
 * Packs an input.
 */
export function encodeInput(mv: number, fire: boolean, dash: boolean, shield: boolean, aim: number): number;

/**
 * The 16 Q32.32 pricing features.
 */
export function features(state_bytes: Uint8Array | number[]): BigInt64Array;

/**
 * Genesis hash of a state.
 */
export function genesisHash(state_bytes: Uint8Array | number[]): Uint8Array;

/**
 * One hash-chain link.
 */
export function hashLink(prev: Uint8Array | number[], tick: bigint, state_bytes: Uint8Array | number[]): Uint8Array;

/**
 * Initial state bytes for a match.
 */
export function newState(dt_ms: number, seed: Uint8Array | number[]): Uint8Array;

/**
 * Policy observation (22 floats) for fighter `me`, identical to training.
 */
export function observe(state_bytes: Uint8Array | number[], me: number): Float32Array;

/**
 * Calibrated P(A wins) ×2^32 from model params bytes and a state.
 */
export function predict(params: Uint8Array | number[], state_bytes: Uint8Array | number[]): number;

/**
 * Quotes [mid, bidA, askA, bidB, askB, spread] in micro-USDC.
 */
export function quotes(p: number, vol: bigint, time_left_ms: bigint, inv_a: bigint, inv_b: bigint, cap: bigint, s_base: bigint, s_vol_bps: bigint, s_time: bigint, k_skew: bigint): BigUint64Array;

/**
 * Replays a match. `inputs` is a flat [a0, b0, a1, b1, …] array; `seed_events` holds 36-byte
 * records (u32 LE apply-at tick, 32-byte seed). Returns 32 bytes per tick (the hash chain).
 */
export function replay(initial_state: Uint8Array | number[], inputs: Uint16Array | number[], seed_events: Uint8Array | number[]): Uint8Array;

/**
 * Final state bytes after a replay (same arguments as `replay`).
 */
export function replayFinalState(initial_state: Uint8Array | number[], inputs: Uint16Array | number[], seed_events: Uint8Array | number[]): Uint8Array;

/**
 * Default sigmoid LUT (1024 × u32), built with the integer exp.
 */
export function sigmoidLut(): Uint32Array;

/**
 * Size of the canonical state encoding.
 */
export function simBytes(): number;

/**
 * JSON view of a state for rendering.
 */
export function stateJson(state_bytes: Uint8Array | number[]): string;

/**
 * Steps a state; returns the new state bytes followed by 4 bytes of event flags (LE) and
 * 4 bytes of [dmgA, dmgB, pickupA, pickupB].
 */
export function step(state_bytes: Uint8Array | number[], input_a: number, input_b: number): Uint8Array;
