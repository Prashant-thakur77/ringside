#!/usr/bin/env bash
# Deploys Ringside to Solana devnet and sets everything up against MagicBlock devnet-tee:
# program, config, model params, test-dollar mint (house + bots), house vault, funded bots.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
RPC="${SOLANA_RPC:-https://api.devnet.solana.com}"
ADMIN=keys/admin.json
PROGRAM_KEY=keys/ringside-program.json
PROGRAM_ID="$(solana-keygen pubkey $PROGRAM_KEY)"
BAL=$(solana balance -u "$RPC" -k $ADMIN | cut -d' ' -f1)
echo "admin $(solana-keygen pubkey $ADMIN) balance $BAL SOL"
anchor build --ignore-keys
cp $PROGRAM_KEY target/deploy/ringside-keypair.json
SIZE=$(stat -c %s target/deploy/ringside.so)
if solana program show "$PROGRAM_ID" -u "$RPC" >/dev/null 2>&1; then
  echo "upgrading $PROGRAM_ID"
else
  echo "first deploy of $PROGRAM_ID ($SIZE bytes)"
fi
solana program deploy -u "$RPC" -k $ADMIN --program-id $PROGRAM_KEY --max-len $((SIZE + 40960)) \
  --with-compute-unit-price 50000 --max-sign-attempts 30 target/deploy/ringside.so
cd scripts
export RINGSIDE_ENV=devnet
npx tsx mint-test-dollar.ts
npx tsx init-config.ts
npx tsx upload-model.ts
npx tsx seed-house.ts
npx tsx fund-bots.ts
echo "program: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
