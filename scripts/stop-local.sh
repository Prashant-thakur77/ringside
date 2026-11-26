#!/usr/bin/env bash
# Stops the local stack (base validator and the ER container).
for p in $(pgrep -f "solana-test-validato[r]") $(pgrep -f "mb-test-validato[r]"); do kill "$p" 2>/dev/null || true; done
docker rm -f ringside-er >/dev/null 2>&1 || true
for _ in $(seq 1 30); do ss -ltn | grep -qE ":8899 |:7799 " || break; sleep 1; done
