"""Shared settings for the win-probability pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "eval" / "data" / "raw"
OUT = ROOT / "ml" / "winprob" / "out"
N_MATCHES = 200_000
CHUNK = 20_000
BASE_SEED = 2026_11_27
EVERY = 5
ONE = 1 << 32
MODEL_VERSION = 1


def split_of(match_id):
    """Split by match (never by tick): 70% train, 15% val, 15% held-out test."""
    r = match_id % 20
    return (r >= 14).astype("i1") + (r >= 17).astype("i1")  # 0 train, 1 val, 2 test
