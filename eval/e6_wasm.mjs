// Reads {initial, inputs, seeds, hashes} on stdin, replays with the WASM build, prints "ok" on a match.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const w = require("../crates/ringside-wasm/pkg/node/ringside_wasm.js");
let buf = "";
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  const e = JSON.parse(buf);
  const chain = w.replay(Buffer.from(e.initial, "hex"), Uint16Array.from(e.inputs.flat()), Buffer.from(e.seeds, "hex"));
  for (let i = 0; i < e.hashes.length; i++) {
    if (Buffer.from(chain.subarray(i * 32, i * 32 + 32)).toString("hex") !== e.hashes[i]) {
      console.log(`mismatch at ${i + 1}`);
      return;
    }
  }
  console.log(chain.length === e.hashes.length * 32 ? "ok" : "length");
});
