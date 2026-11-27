"""E3: latency snapshot from the indexer (tick cadence measured from successive tick events,
quote age at fill from the fill's game tick vs the tick the order saw, submit→confirm from the
bots' OpenTelemetry spans). Writes eval/data/e3-<env>.json."""
import json
import os
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEXER = os.environ.get("INDEXER_URL", "http://127.0.0.1:8787")
ENV = os.environ.get("RINGSIDE_ENV", "devnet")
with urllib.request.urlopen(INDEXER + "/stats", timeout=30) as r:
    s = json.load(r)
out = {
    "tick_cadence_ms": s["tick_cadence_ms"],
    "quote_age_at_fill_ms": s["quote_age_at_fill_ms"],
    "submit_confirm_ms": {x["kind"]: {"p50": x["p50"], "p95": x["p95"], "n": x["n"]} for x in s["latency"]},
    "counts": s["counts"],
    "host_region": os.environ.get("HOST_REGION", "Asia (India), residential connection"),
    "er_endpoint": os.environ.get("ER_RPC", "https://devnet-tee.magicblock.app"),
}
qa = out["quote_age_at_fill_ms"]
out["quote_age_text"] = (
    f"Quote age at fill p50 {qa['p50']:.0f} ms, p95 {qa['p95']:.0f} ms."
    if qa and qa.get("n")
    else "Quote age at fill is not observable from outside on the private rollup: a trader's transaction is visible only to its signer, so fills are indexed from the public market account without the tick the order saw (the program still enforces the 2-tick window on every fill)."
)
(ROOT / f"eval/data/e3-{ENV}.json").write_text(json.dumps(out, indent=2))
print(json.dumps({k: out[k] for k in ("tick_cadence_ms", "quote_age_at_fill_ms")}))
