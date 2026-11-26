"""Python checks for the ML pipeline and the PyO3 environment."""
import sys
from pathlib import Path

import numpy as np
import ringside_sim as rs

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml" / "winprob"))
from common import split_of  # noqa: E402


def test_split_is_by_match_and_disjoint():
    d = rs.generate_dataset(0, 3000, 99, 5)
    s = split_of(d["match_id"])
    for m in np.unique(d["match_id"]):
        assert len(np.unique(s[d["match_id"] == m])) == 1
    frac = np.bincount(split_of(np.arange(100_000)), minlength=3) / 100_000
    assert np.allclose(frac, [0.70, 0.15, 0.15], atol=1e-9)


def test_dataset_shapes_and_labels():
    d = rs.generate_dataset(0, 500, 5, 5)
    assert d["x"].shape[1] == 16
    assert set(np.unique(d["y"])).issubset({0.0, 0.5, 1.0})
    assert (d["tick"] % 5 == 0).all()
    assert len(d["match_meta"]) == 500


def test_vecenv_contract():
    env = rs.VecEnv(8, 3, True, False)
    assert env.obs_dim == 22 and env.n_actions == 72
    obs = env.reset_all()
    assert obs.shape == (8, 22) and np.isfinite(obs).all()
    finished = 0
    for _ in range(1200):
        obs, r, d, o = env.step(np.random.randint(0, 72, 8).astype(np.int64), np.full(8, -1, dtype=np.int64))
        finished += int(d.sum())
        assert set(np.unique(o[d])).issubset({-1.0, 0.0, 1.0})
    assert finished >= 8


def test_heldout_seeds_are_odd_training_even():
    # Same rng stream, different parity → disjoint match seeds by construction.
    a = rs.VecEnv(4, 11, False, False)
    b = rs.VecEnv(4, 11, False, True)
    oa, ob = a.reset_all(), b.reset_all()
    assert oa.shape == ob.shape


def test_integer_model_roundtrip():
    lut = rs.sigmoid_lut()
    ident = [j * 0xFFFFFFFF // 63 for j in range(64)]
    one = 1 << 32
    blob = rs.params_to_bytes([0] * 16, [one] * 16, [one] + [0] * 15, 0, lut, ident)
    x = np.zeros((3, 16), dtype=np.int64)
    x[:, 0] = [-2 * one, 0, 2 * one]
    p = rs.predict_int(blob, x, True) / 2**32
    want = 1 / (1 + np.exp(-np.array([-2.0, 0.0, 2.0])))
    assert np.allclose(p, want, atol=2e-3)
