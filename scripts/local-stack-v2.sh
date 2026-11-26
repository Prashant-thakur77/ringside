#!/usr/bin/env bash
# Local MagicBlock 2.0 stack (matches devnet-tee's validator 2.0): base validator with the 2.0
# program dumps, Ringside deployed (upgradeable), ER 2.0 in Docker, ER VRF oracle and a Hydra
# cranker so ScheduleTask cranks actually fire.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
STATE="${STATE:-.local-stack}"
PKG="@magicblock-labs/ephemeral-validator@2.0.3"
RPC=http://127.0.0.1:8899
mkdir -p "$STATE"
(cd "$STATE" && setsid nohup npx --yes --package="$PKG" mb-test-validator --reset > base.log 2>&1 < /dev/null &)
for _ in $(seq 1 90); do solana -u $RPC cluster-version >/dev/null 2>&1 && break; sleep 1; done
echo "base ready"
for k in admin keeper relay indexer; do solana -u $RPC airdrop 100 "$(solana-keygen pubkey keys/$k.json)" >/dev/null; done
solana -u $RPC airdrop 10 4RvdEGaUyChj3AketeBZoY1EotNtPveMFUXL8DVetrAp >/dev/null
solana -u $RPC program deploy -k keys/admin.json --program-id keys/ringside-program.json target/deploy/ringside.so | tail -n 1
BIN="$(for d in ~/.npm/_npx/*/node_modules/@magicblock-labs/ephemeral-validator; do grep -q '"version": "2.0.3"' $d/package.json && echo $d; done | head -1)/.."
EV="$(ls $BIN/ephemeral-validator-linux-x64/bin/ephemeral-validator)"
solana -u $RPC airdrop 100 mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev >/dev/null
docker rm -f ringside-er >/dev/null 2>&1 || true
docker run -d --name ringside-er --network host --ulimit nofile=1048576:1048576 -v "$EV":/ev:ro -w /tmp ubuntu:24.04 \
  /ev --listen 127.0.0.1:7799 --remotes http://127.0.0.1:8899 --remotes ws://127.0.0.1:8900 >/dev/null
for _ in $(seq 1 60); do curl -s -X POST -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getVersion"}' http://127.0.0.1:7799 | grep -q core && break; sleep 1; done
echo "ER: $(curl -s -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getVersion"}' http://127.0.0.1:7799)"
TOOLS="$BIN"
(cd "$STATE" && setsid nohup "$TOOLS/vrf-oracle-linux-x64/bin/vrf-oracle" --rpc-url http://127.0.0.1:7799 --websocket-url ws://127.0.0.1:7800 > vrf.log 2>&1 < /dev/null &)
[ -f keys/cranker.json ] || solana-keygen new --no-bip39-passphrase -s -o keys/cranker.json >/dev/null
solana -u $RPC airdrop 10 "$(solana-keygen pubkey keys/cranker.json)" >/dev/null
(cd "$STATE" && setsid nohup "$TOOLS/hydra-cranker-linux-x64/bin/hydra-cranker" --ephemeral --base-rpc-url http://127.0.0.1:8899 --keypair "$PWD/../keys/cranker.json" --rpc-url http://127.0.0.1:7799 --ws-url ws://127.0.0.1:7800 --prometheus-port 9797 > cranker.log 2>&1 < /dev/null &)
echo "vrf-oracle and hydra-cranker started (logs in $STATE)"
