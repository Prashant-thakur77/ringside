// Copies the vendored simulation build (Rust compiled to WASM, Node target) next to the compiled server.
import { cpSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "dist/wasm"), { recursive: true });
for (const f of ["ringside_wasm.js", "ringside_wasm_bg.wasm", "package.json"]) cpSync(join(root, "wasm", f), join(root, "dist/wasm", f));
chmodSync(join(root, "dist/index.js"), 0o755);
