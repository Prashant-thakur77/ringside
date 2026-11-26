"""Python side of the determinism test.

1. Recomputes the shared-generator episodes and compares with the native file.
2. Generates host-side random episodes (numpy inputs + VRF seed events), replays them and writes
   every chain hash so the WASM build can compare tick by tick.
Usage: python tests/determinism/python_check.py <native.txt> <host_out.json> [n_host]
"""
import json
import struct
import sys

import numpy as np
import ringside_sim as rs


def main() -> int:
    native_file, host_out = sys.argv[1], sys.argv[2]
    n_host = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    native = open(native_file).read().split()
    ok = sum(rs.determinism_episode_hash(e).hex() == h for e, h in enumerate(native))
    print(f"python vs native: {ok}/{len(native)} episodes identical")

    rng = np.random.default_rng(20261127)
    episodes = []
    for _ in range(n_host):
        seed0 = rng.bytes(32)
        init = rs.new_state(100, seed0)
        n = int(rng.integers(300, 1000))
        held = rng.integers(0, 0x0F7F, size=(n, 2)) & 0x0F7F
        keep = rng.random((n, 2)) < 0.8
        for t in range(1, n):
            held[t][keep[t]] = held[t - 1][keep[t]]
        inputs = [(int(a), int(b)) for a, b in held]
        ticks = np.sort(rng.integers(1, n, size=int(rng.integers(1, 7))))
        seeds = b"".join(struct.pack("<I", int(t)) + rng.bytes(32) for t in ticks)
        chain = rs.replay(init, inputs, seeds)
        episodes.append({"initial": init.hex(), "inputs": inputs[: len(chain)], "seeds": seeds.hex(), "hashes": [h.hex() for h in chain]})
    json.dump(episodes, open(host_out, "w"))
    print(f"python host episodes: {len(episodes)} written")
    return 0 if ok == len(native) else 1


if __name__ == "__main__":
    sys.exit(main())
