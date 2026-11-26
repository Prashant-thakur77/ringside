#!/usr/bin/env bash
# Fresh local stack + full Ringside setup (mint, config, model, house, bots).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
./scripts/stop-local.sh
rm -rf .local-stack keys/state-local.json
./scripts/local-stack.sh
RPC=http://127.0.0.1:8899
for k in admin keeper relay; do solana -u $RPC airdrop 100 "$(solana-keygen pubkey keys/$k.json)" >/dev/null; done
# eSPL rent PDA (funded by the operator on devnet).
solana -u $RPC airdrop 10 4RvdEGaUyChj3AketeBZoY1EotNtPveMFUXL8DVetrAp >/dev/null
cd scripts
export RINGSIDE_ENV=local
timeout 120 npx tsx mint-test-dollar.ts --force
npx tsx init-config.ts
npx tsx upload-model.ts | tail -n 1
npx tsx seed-house.ts | tail -n 1
npx tsx fund-bots.ts | tail -n 1
