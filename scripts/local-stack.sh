#!/usr/bin/env bash
# Local MagicBlock stack for script/bot integration tests:
#   base validator (MagicBlock program dumps + Ringside) on :8899, ephemeral rollup on :7799.
# The ER needs nofile >= 1,000,000; it runs in Docker (--ulimit) when the host limit is lower.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
STATE="${STATE:-.local-stack}"
mkdir -p "$STATE"
PKG="@magicblock-labs/ephemeral-validator@1.1.1"
PROGRAM_ID="$(solana-keygen pubkey keys/ringside-program.json)"

(cd "$STATE" && setsid nohup npx --yes --package="$PKG" mb-test-validator --reset > base.log 2>&1 < /dev/null &)
for _ in $(seq 1 60); do solana -u http://127.0.0.1:8899 cluster-version >/dev/null 2>&1 && break; sleep 1; done
echo "base ready on :8899"
# Ringside is deployed as an upgradeable program (upgrade authority = admin).
solana -u http://127.0.0.1:8899 airdrop 100 "$(solana-keygen pubkey keys/admin.json)" >/dev/null
solana -u http://127.0.0.1:8899 program deploy -k keys/admin.json --program-id keys/ringside-program.json target/deploy/ringside.so | tail -n 1
# The ER validator identity must be funded on the base layer.
solana -u http://127.0.0.1:8899 airdrop 100 mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev >/dev/null

EV="$(ls ~/.npm/_npx/*/node_modules/@magicblock-labs/ephemeral-validator-linux-x64/bin/ephemeral-validator | head -1)"
docker rm -f ringside-er >/dev/null 2>&1 || true
docker run -d --name ringside-er --network host --ulimit nofile=1048576:1048576 -v "$EV":/ev:ro -w /tmp ubuntu:24.04 \
  /ev --no-tui --listen 127.0.0.1:7799 --remotes http://127.0.0.1:8899 --remotes ws://127.0.0.1:8900 >/dev/null
for _ in $(seq 1 60); do curl -s -X POST -H "content-type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getVersion\"}" http://127.0.0.1:7799 | grep -q magicblock && break; sleep 1; done
echo "ephemeral rollup ready on :7799"
