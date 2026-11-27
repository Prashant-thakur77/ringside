// The shared Rust simulation in the browser (same code as the program and the bots).
type Wasm = typeof import("../../public/wasm/ringside_wasm.js");
let p: Promise<Wasm> | null = null;
export function loadSim(): Promise<Wasm> {
  p ??= (async () => {
    // Built at runtime so server bundlers leave this browser-only import alone.
    const url = new URL("/wasm/ringside_wasm.js", window.location.origin).href;
    const m = (await import(/* webpackIgnore: true */ url)) as Wasm & { default: (u?: string) => Promise<unknown> };
    await m.default("/wasm/ringside_wasm_bg.wasm");
    return m;
  })();
  return p;
}

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
export const hexToBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));
export const bytesToHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
