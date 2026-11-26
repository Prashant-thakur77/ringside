#!/usr/bin/env bash
# The full devnet run, in stages (each logs to .devnet/<stage>.log). Safe to re-run a stage.
#   ./scripts/devnet-all.sh deploy | services | e2e | eval | soak | report | web | all
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
export RINGSIDE_ENV=devnet
LOG=.devnet; mkdir -p $LOG
RUNNERS="${RUNNERS:-4}"
TOOLS="$(for d in ~/.npm/_npx/*/node_modules/@magicblock-labs/ephemeral-validator; do grep -q '"version": "2.0.3"' $d/package.json && echo $d; done | head -1)/.."

deploy() {
  HOUSE_AMOUNT=50000000000 ./scripts/deploy-devnet.sh
  BOTS="spec-1,spec-2,spec-3,spec-4,courtsider,fighter-a,fighter-b,session-user$(for i in $(seq 1 $RUNNERS); do printf ',fighter-a-%s,fighter-b-%s' $i $i; done)" BOT_AMOUNT=200000000 npx tsx scripts/fund-bots.ts
  for k in keeper cranker indexer relay $(for i in $(seq 1 $RUNNERS); do echo keeper-$i; done); do
    [ -f keys/$k.json ] || solana-keygen new --no-bip39-passphrase -s -o keys/$k.json >/dev/null
    solana transfer -u devnet -k keys/admin.json --allow-unfunded-recipient "$(solana-keygen pubkey keys/$k.json)" 0.2 >/dev/null
  done
}

services() {
  docker compose up -d postgres
  (DATABASE_URL=postgres://ringside:ringside@127.0.0.1:5435/ringside INDEXER_KEYPAIR=keys/indexer.json COURTSIDER="$(solana-keygen pubkey keys/courtsider.json)" \
    setsid nohup services/indexer/target/release/ringside-indexer > $LOG/indexer.log 2>&1 < /dev/null & echo $! > $LOG/indexer.pid)
  TEE_URL="$(cd scripts && npx tsx tee-url.ts cranker | tail -n 1)"
  (setsid nohup "$TOOLS/hydra-cranker-linux-x64/bin/hydra-cranker" --ephemeral --base-rpc-url https://api.devnet.solana.com \
    --keypair keys/cranker.json --rpc-url "$TEE_URL" --ws-url "${TEE_URL/https/wss}" --prometheus-port 9797 > $LOG/cranker.log 2>&1 < /dev/null & echo $! > $LOG/cranker.pid)
  (cd bots && setsid nohup npx tsx matchmaker.ts > ../$LOG/matchmaker.log 2>&1 < /dev/null & echo $! > ../$LOG/matchmaker.pid)
  echo "indexer, hydra-cranker and matchmaker started"
}

e2e() { (cd scripts && npx tsx e2e.ts) 2>&1 | tee $LOG/e2e.log | grep -E "\[e2e\]" ; }

eval_e1() {
  (cd bots && setsid nohup npx tsx lobby.ts --arena > ../$LOG/arena.log 2>&1 < /dev/null & echo $! > ../$LOG/arena.pid)
  sleep 5
  for i in $(seq 1 $RUNNERS); do
    (cd bots && INPUT_EVERY=2 AI_TEMPERATURE=0.5 setsid nohup npx tsx lobby.ts --runner $i --matches "${MATCHES:-32}" --delays "${DELAYS:-5000,500,5000,1000,5000,2000,5000,8000}" > ../$LOG/runner-$i.log 2>&1 < /dev/null & echo $! > ../$LOG/runner-$i.pid)
  done
  echo "arena + $RUNNERS runners started; follow eval/data/courtsider-devnet.jsonl"
}

soak() {
  (cd bots && setsid nohup npx tsx run-match.ts --a defensive --b defensive > ../$LOG/soak-match.log 2>&1 < /dev/null &)
  for _ in $(seq 1 60); do ID=$(grep -oE "match [0-9]+ created" $LOG/soak-match.log | grep -oE "[0-9]+" || true); [ -n "$ID" ] && break; sleep 2; done
  (cd bots && npx tsx soak/setup.ts "$ID" 16)
  MINT="$(python3 -c "import json;print(json.load(open('keys/state-devnet.json'))['mint'])")" KEYS_DIR=keys ER_RPC="$(cd scripts && npx tsx tee-url.ts admin | tail -n 1)" \
    bots/soak/target/release/ringside-soak "$ID" 16 40 | tee eval/data/e4-soak-devnet.json
}

report() {
  HOST_REGION="${HOST_REGION:-Asia (India), residential connection}" ER_RPC=https://devnet-tee.magicblock.app .venv/bin/python eval/e3_latency.py
  .venv/bin/python eval/e6_replay.py 20
  .venv/bin/python eval/make_report.py devnet
  .venv/bin/python scripts/render_docs.py
  .venv/bin/python scripts/check_consistency.py || true
}

case "${1:-all}" in
  deploy) deploy ;; services) services ;; e2e) e2e ;; eval) eval_e1 ;; soak) soak ;; report) report ;;
  all) deploy; services; e2e; eval_e1 ;;
esac
