"""E6: replay determinism. For the last K finished matches, fetch inputs + VRF seeds + onchain
hash chain from the indexer, re-simulate in Python (PyO3) and in WASM (Node), and compare every
link with the hash the program wrote. Writes eval/data/e6-<env>.json."""
import json
import os
import struct
import subprocess
import sys
import urllib.request
from pathlib import Path

import ringside_sim as rs

ROOT = Path(__file__).resolve().parents[1]
INDEXER = os.environ.get("INDEXER_URL", "http://127.0.0.1:8787")
ENV = os.environ.get("RINGSIDE_ENV", "devnet")
K = int(sys.argv[1]) if len(sys.argv) > 1 else 20


def get(path):
    with urllib.request.urlopen(INDEXER + path, timeout=30) as r:
        return json.load(r)


def main():
    matches = [m for m in get("/matches?limit=200") if m["status"] >= 4][:K]
    results = []
    for m in matches:
        d = get(f"/matches/{m['match_id']}/replay")
        if not d["ticks"] or not d["complete"]:
            results.append({"match_id": m["match_id"], "complete": False})
            continue
        init = rs.new_state(d["tick_ms"], bytes(32))
        inputs = [tuple(t["inputs"]) for t in d["ticks"]]
        seeds = b"".join(struct.pack("<I", s["apply_at_tick"]) + bytes.fromhex(s["seed"]) for s in d["seeds"])
        chain = [h.hex() for h in rs.replay(init, inputs, seeds)]
        onchain = [t["hash"] for t in d["ticks"]]
        py_ok = chain == onchain
        payload = json.dumps({"initial": init.hex(), "inputs": inputs, "seeds": seeds.hex(), "hashes": onchain})
        wasm = subprocess.run(["node", str(ROOT / "eval/e6_wasm.mjs")], input=payload, capture_output=True, text=True)
        wasm_ok = wasm.stdout.strip() == "ok"
        results.append({"match_id": m["match_id"], "complete": True, "ticks": len(onchain), "python": py_ok, "wasm": wasm_ok})
        print(m["match_id"], len(onchain), "python", py_ok, "wasm", wasm_ok, wasm.stderr.strip()[:200])
    complete = [r for r in results if r.get("complete")]
    out = {"k": len(complete), "incomplete_excluded": len(results) - len(complete), "verified_python": sum(r.get("python", False) for r in complete), "verified_wasm": sum(r.get("wasm", False) for r in complete),
           "ticks_checked": sum(r.get("ticks", 0) for r in complete), "matches": results}
    p = ROOT / f"eval/data/e6-{ENV}.json"
    p.write_text(json.dumps(out, indent=2))
    print(f"E6: python {out['verified_python']}/{out['k']}, wasm {out['verified_wasm']}/{out['k']} ({out['ticks_checked']} links)")


if __name__ == "__main__":
    main()
