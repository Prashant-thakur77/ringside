"""Generates >= 200,000 simulated matches (mixed scripted pairings and skills, random VRF-like
seeds) and stores every 5th tick as (16 integer features, winner) in chunked .npz files."""
import time

import numpy as np
import ringside_sim as rs

from common import BASE_SEED, CHUNK, EVERY, N_MATCHES, RAW


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    total_rows = 0
    for start in range(0, N_MATCHES, CHUNK):
        d = rs.generate_dataset(start, CHUNK, BASE_SEED, EVERY)
        np.savez(
            RAW / f"chunk_{start // CHUNK:03d}.npz",
            x=d["x"], match_id=d["match_id"], tick=d["tick"], y=d["y"], hp=d["hp"], phase=d["phase"], meta=d["match_meta"],
        )
        total_rows += len(d["y"])
        print(f"chunk {start // CHUNK}: {len(d['y'])} rows, {len(d['match_meta'])} matches")
    print(f"generated {N_MATCHES} matches, {total_rows} rows in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
