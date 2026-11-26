#!/usr/bin/env bash
# Builds the simulation for the browser (apps/web) and for Node (bots, tests).
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --release -p ringside-wasm --target wasm32-unknown-unknown
WASM=target/wasm32-unknown-unknown/release/ringside_wasm.wasm
wasm-bindgen "$WASM" --target web --out-dir crates/ringside-wasm/pkg/web
wasm-bindgen "$WASM" --target nodejs --out-dir crates/ringside-wasm/pkg/node
echo "wasm ok: $(du -h "$WASM" | cut -f1)"
