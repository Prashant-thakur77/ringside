#!/usr/bin/env bash
# Native vs WASM vs Python: 10,000 random-input episodes must give identical hash chains.
set -euo pipefail
cd "$(dirname "$0")/../.."
N="${1:-10000}"
OUT="$(mktemp -d)"
PY="${PYTHON:-.venv/bin/python}"
cargo run --release -q -p ringside-sim --example determinism -- "$N" "$OUT/native.txt"
"$PY" tests/determinism/python_check.py "$OUT/native.txt" "$OUT/host.json" 200
node tests/determinism/wasm.mjs "$OUT/native.txt" "$OUT/host.json"
echo "determinism: native = python = wasm for $N episodes"
