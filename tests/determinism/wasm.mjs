// Cross-target determinism: WASM (Node) must reproduce the native and Python hash chains.
// Usage: node tests/determinism/wasm.mjs <native.txt> <host_episodes.json>
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const wasm = require("../../crates/ringside-wasm/pkg/node/ringside_wasm.js");

const hex = (u8) => Buffer.from(u8).toString("hex");
const [nativeFile, hostFile] = process.argv.slice(2);

// 1. Shared-generator episodes: final hash per episode.
const native = readFileSync(nativeFile, "utf8").trim().split("\n");
let ok = 0;
for (let e = 0; e < native.length; e++) {
  if (hex(wasm.determinismEpisodeHash(BigInt(e))) === native[e]) ok++;
  else console.error(`episode ${e} mismatch`);
}
console.log(`wasm vs native: ${ok}/${native.length} episodes identical`);

// 2. Host-generated episodes (inputs made in Python): every per-tick hash must match.
const host = JSON.parse(readFileSync(hostFile, "utf8"));
let hostOk = 0;
let links = 0;
for (const ep of host) {
  const init = Buffer.from(ep.initial, "hex");
  const inputs = Uint16Array.from(ep.inputs.flat());
  const seeds = Buffer.from(ep.seeds, "hex");
  const chain = wasm.replay(init, inputs, seeds);
  let same = chain.length === ep.hashes.length * 32;
  for (let t = 0; same && t < ep.hashes.length; t++) {
    same = hex(chain.subarray(t * 32, t * 32 + 32)) === ep.hashes[t];
  }
  links += ep.hashes.length;
  if (same) hostOk++;
}
console.log(`wasm vs python replay: ${hostOk}/${host.length} episodes, ${links} chain links compared`);
process.exit(ok === native.length && hostOk === host.length ? 0 : 1);
