// Copies the browser build of the shared simulation into public/ (built by scripts/build-wasm.sh).
import fs from "node:fs";
const src = new URL("../../../crates/ringside-wasm/pkg/web/", import.meta.url);
const dst = new URL("../public/wasm/", import.meta.url);
fs.mkdirSync(dst, { recursive: true });
for (const f of ["ringside_wasm.js", "ringside_wasm_bg.wasm", "ringside_wasm.d.ts"]) fs.copyFileSync(new URL(f, src), new URL(f, dst));
console.log("wasm copied");
