// The shared Rust simulation compiled to WASM (crates/ringside-wasm, nodejs target).
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT } from "@ringside/client/node";

const require = createRequire(import.meta.url);
export const sim = require(path.join(ROOT, "crates/ringside-wasm/pkg/node/ringside_wasm.js")) as typeof import("../../crates/ringside-wasm/pkg/node/ringside_wasm.js");

export interface FighterView {
  x: number; y: number; vx: number; vy: number; aim: number; hp: number;
  fireCd: number; dashCd: number; dashMs: number; shieldCd: number; shieldMs: number; overchargeMs: number; hasteMs: number;
}
export interface StateView {
  tick: number; timeMs: number; phase: number; winner: number; sdMs: number; waveIndex: number; nextWaveMs: number;
  fighters: [FighterView, FighterView];
  projectiles: { owner: number; dmg: number; x: number; y: number; vx: number; vy: number }[];
  powerups: { kind: number; x: number; y: number }[];
}
export const view = (simBytes: Uint8Array): StateView => JSON.parse(sim.stateJson(simBytes));
