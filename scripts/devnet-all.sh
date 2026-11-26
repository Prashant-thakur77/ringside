#!/usr/bin/env bash
# The full devnet run, in stages (each logs to .devnet/<stage>.log). Safe to re-run a stage.
#   ./scripts/devnet-all.sh deploy | services | e2e | eval | soak | report | web | all
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
export RINGSIDE_ENV=devnet
LOG=.devnet; mkdir -p $LOG
RUNNERS="${RUNNERS:-4}"
# start <name> <dir> <command...>: detached session; the session leader writes its own pid = pgid,
# so ./scripts/stop-groups.sh "$(cat .devnet/<name>.pid)" stops the whole tree.
start() {
  local name="$1" dir="$2"; shift 2
  (cd "$dir" && setsid bash -c "echo \$\$ > '$PWD/$LOG/$name.pid'; exec \"\$@\"" _ "$@" > "$PWD/$LOG/$name.log" 2>&1 < /dev/null &)
}
stop() { for n in "$@"; do [ -f "$LOG/$n.pid" ] && setsid ./scripts/stop-groups.sh "$(cat $LOG/$n.pid)" < /dev/null > /dev/null 2>&1; rm -f "$LOG/$n.pid"; done; }
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
  DATABASE_URL=postgres://ringside:ringside@127.0.0.1:5435/ringside INDEXER_KEYPAIR=keys/indexer.json COURTSIDER="$(solana-keygen pubkey keys/courtsider.json)" \
    start indexer . services/indexer/target/release/ringside-indexer
  TEE_URL="$(cd scripts && npx tsx tee-url.ts cranker | tail -n 1)"
  start cranker . "$TOOLS/hydra-cranker-linux-x64/bin/hydra-cranker" --ephemeral --base-rpc-url https://api.devnet.solana.com \
    --keypair keys/cranker.json --rpc-url "$TEE_URL" --ws-url "${TEE_URL/https/wss}" --prometheus-port 9797
  start matchmaker bots npx tsx matchmaker.ts
  echo "indexer, hydra-cranker and matchmaker started"
}

e2e() { (cd scripts && npx tsx e2e.ts) 2>&1 | tee $LOG/e2e.log | grep -E "\[e2e\]" ; }

eval_e1() {
  start arena bots npx tsx lobby.ts --arena
  sleep 5
  for i in $(seq 1 $RUNNERS); do
    INPUT_EVERY=2 AI_TEMPERATURE=0.5 start runner-$i bots npx tsx lobby.ts --runner $i --matches "${MATCHES:-32}" --delays "${DELAYS:-5000,500,5000,1000,5000,2000,5000,8000}"
  done
  echo "arena + $RUNNERS runners started; follow eval/data/courtsider-devnet.jsonl"
}

soak() {
  start soak-match bots npx tsx run-match.ts --a defensive --b defensive
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
  stop) stop arena matchmaker cranker indexer soak-match $(for i in $(seq 1 $RUNNERS); do echo runner-$i; done) ;;
  deploy) deploy ;; services) services ;; e2e) e2e ;; eval) eval_e1 ;; soak) soak ;; report) report ;;
  all) deploy; services; e2e; eval_e1 ;;
esac
