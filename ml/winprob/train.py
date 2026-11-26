"""Win-probability model: LightGBM teacher → distilled logistic student → isotonic calibration →
Q32.32 quantization → evaluation of the exact onchain integer implementation on the held-out split.

Writes ml/winprob/out/{model_v1.bin, params.json, metrics.json, reliability.png, test_preds.npz}.
"""
import hashlib
import json
import time

import lightgbm as lgb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import ringside_sim as rs
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

from common import MODEL_VERSION, ONE, OUT, RAW, split_of

RNG = np.random.default_rng(7)
TRAIN_ROWS = 3_000_000
EPS = 1e-6


def load(split_id: int, keep: float):
    xs, ys, hps, phs, tks, mids = [], [], [], [], [], []
    for f in sorted(RAW.glob("chunk_*.npz")):
        d = np.load(f)
        mask = (split_of(d["match_id"]) == split_id) & (d["y"] != 0.5)
        if keep < 1.0:
            mask &= RNG.random(len(mask)) < keep
        xs.append(d["x"][mask])
        ys.append(d["y"][mask])
        hps.append(d["hp"][mask])
        phs.append(d["phase"][mask])
        tks.append(d["tick"][mask])
        mids.append(d["match_id"][mask])
    return (np.concatenate(xs), np.concatenate(ys), np.concatenate(hps), np.concatenate(phs), np.concatenate(tks), np.concatenate(mids))


def count_draws():
    total = draws = 0
    split_matches = {0: set(), 1: set(), 2: set()}
    for f in sorted(RAW.glob("chunk_*.npz")):
        d = np.load(f)
        meta = d["meta"]
        total += len(meta)
        # one label per match: take the first row of each match
        _, first = np.unique(d["match_id"], return_index=True)
        draws += int((d["y"][first] == 0.5).sum())
        for s in (0, 1, 2):
            ids = meta[:, 0][split_of(meta[:, 0]) == s]
            split_matches[s].update(ids.tolist())
    return total, draws, {k: len(v) for k, v in split_matches.items()}


def brier(p, y):
    return float(np.mean((p - y) ** 2))


def logloss(p, y):
    p = np.clip(p, EPS, 1 - EPS)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def ece(p, y, bins=10):
    idx = np.minimum((p * bins).astype(int), bins - 1)
    e = 0.0
    for b in range(bins):
        m = idx == b
        if m.any():
            e += m.mean() * abs(p[m].mean() - y[m].mean())
    return float(e)


def reliability(p, y, bins=10):
    idx = np.minimum((p * bins).astype(int), bins - 1)
    out = []
    for b in range(bins):
        m = idx == b
        out.append([float(p[m].mean()) if m.any() else None, float(y[m].mean()) if m.any() else None, int(m.sum())])
    return out


def metrics(p, y):
    return {"brier": brier(p, y), "log_loss": logloss(p, y), "ece": ece(p, y), "n": int(len(y))}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    n_matches, n_draws, split_counts = count_draws()
    xtr_i, ytr, _, _, _, _ = load(0, TRAIN_ROWS / 13_400_000)
    xva_i, yva, _, _, _, _ = load(1, 1.0)
    xte_i, yte, hpte, phte, tkte, midte = load(2, 1.0)
    xtr, xva, xte = (a.astype(np.float64) / ONE for a in (xtr_i, xva_i, xte_i))
    print(f"rows train {len(ytr)} val {len(yva)} test {len(yte)}  ({time.time() - t0:.0f}s)")

    # Teacher.
    teacher = lgb.LGBMClassifier(n_estimators=400, learning_rate=0.05, num_leaves=63, min_child_samples=200, subsample=0.8, subsample_freq=1, colsample_bytree=0.9, verbose=-1)
    teacher.fit(xtr, ytr, eval_set=[(xva, yva)])
    t_tr = teacher.predict_proba(xtr)[:, 1]
    print(f"teacher trained ({time.time() - t0:.0f}s)")

    # Student: logistic on standardized features, fit to 0.5·teacher + 0.5·label via weighted duplication.
    mean = xtr.mean(0)
    scale = xtr.std(0)
    scale[scale < 1e-9] = 1.0
    ztr = (xtr - mean) / scale
    target = 0.5 * t_tr + 0.5 * ytr
    zz = np.vstack([ztr, ztr])
    yy = np.concatenate([np.ones(len(ztr)), np.zeros(len(ztr))])
    ww = np.concatenate([target, 1 - target])
    student = LogisticRegression(C=1.0, max_iter=500)
    student.fit(zz, yy, sample_weight=ww)
    w = student.coef_[0]
    b = float(student.intercept_[0])
    print(f"student trained ({time.time() - t0:.0f}s)")

    # Quantize to Q32.32 and build the onchain blob with an identity calibration first.
    q = lambda v: int(round(float(v) * ONE))
    mean_q = [q(v) for v in mean]
    inv_q = [q(1.0 / v) for v in scale]
    w_q = [q(v) for v in w]
    b_q = q(b)
    lut = rs.sigmoid_lut()
    ident = [int(j * 0xFFFFFFFF // 63) for j in range(64)]
    blob_raw = rs.params_to_bytes(mean_q, inv_q, w_q, b_q, lut, ident)

    # Isotonic calibration on the validation split, fit on the integer (uncalibrated) outputs.
    raw_va = rs.predict_int(blob_raw, xva_i, False).astype(np.float64) / 2**32
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(raw_va, yva)
    knots = np.linspace(0, 1, 64)
    calib = [int(min(0xFFFFFFFF, max(0, round(v * 2**32)))) for v in iso.predict(knots)]
    blob = rs.params_to_bytes(mean_q, inv_q, w_q, b_q, lut, calib)
    (OUT / f"model_v{MODEL_VERSION}.bin").write_bytes(blob)

    # Held-out evaluation.
    p_coin = np.full(len(yte), 0.5)
    hpa = np.clip(hpte[:, 0], 0, None).astype(np.float64)
    hpb = np.clip(hpte[:, 1], 0, None).astype(np.float64)
    p_hp = np.where(hpa + hpb > 0, hpa / np.maximum(hpa + hpb, 1), 0.5)
    p_teacher = teacher.predict_proba(xte)[:, 1]
    z_te = (xte - mean) / scale
    p_student_raw = 1 / (1 + np.exp(-np.clip(z_te @ w + b, -16, 16)))
    p_student = iso.predict(p_student_raw)
    p_int = rs.predict_int(blob, xte_i, True).astype(np.float64) / 2**32
    models = {
        "coin_flip": p_coin,
        "hp_ratio": p_hp,
        "lightgbm_float": p_teacher,
        "logistic_float": p_student,
        "logistic_onchain_integer": p_int,
    }
    res = {k: metrics(v, yte) for k, v in models.items()}
    gap = np.abs(p_int - p_student)
    sd = phte == 1
    late = tkte >= 700
    buckets = {
        "sudden_death": {k: metrics(v[sd], yte[sd]) for k, v in models.items()} if sd.any() else None,
        "last_20s_regulation": {k: metrics(v[late & ~sd], yte[late & ~sd]) for k, v in models.items()},
        "first_30s": {k: metrics(v[tkte < 300], yte[tkte < 300]) for k, v in models.items()},
    }
    out = {
        "model_version": MODEL_VERSION,
        "split": "by match id: 70% train / 15% val / 15% held-out test (match_id % 20)",
        "n_matches": n_matches,
        "n_draw_matches_excluded": n_draws,
        "split_matches": {"train": split_counts[0], "val": split_counts[1], "test": split_counts[2]},
        "rows": {"train_sampled": int(len(ytr)), "val": int(len(yva)), "test": int(len(yte))},
        "test_matches": int(len(np.unique(midte))),
        "metrics_heldout": res,
        "buckets_heldout": buckets,
        "onchain_vs_float_abs_gap": {"mean": float(gap.mean()), "p99": float(np.quantile(gap, 0.99)), "max": float(gap.max())},
        "reliability_heldout": {k: reliability(models[k], yte) for k in ("hp_ratio", "lightgbm_float", "logistic_onchain_integer")},
        "student": {"features": list(rs.FEATURE_NAMES), "weights": w.tolist(), "bias": b, "mean": mean.tolist(), "scale": scale.tolist()},
        "blob_sha256": hashlib.sha256(blob).hexdigest(),
    }
    canon = json.dumps(out["metrics_heldout"], sort_keys=True).encode()
    out["metrics_hash"] = hashlib.sha256(canon).hexdigest()
    (OUT / "metrics.json").write_text(json.dumps(out, indent=2))
    (OUT / "params.json").write_text(json.dumps({"mean_q": mean_q, "inv_scale_q": inv_q, "weights_q": w_q, "bias_q": b_q, "calib": calib, "version": MODEL_VERSION}, indent=1))
    np.savez_compressed(OUT / "test_preds.npz", y=yte, tick=tkte, phase=phte, **{k: v.astype(np.float32) for k, v in models.items()})

    fig, ax = plt.subplots(figsize=(5.2, 5.2), dpi=150)
    ax.plot([0, 1], [0, 1], color="#888", lw=1, ls="--", label="perfect")
    for name, color in (("hp_ratio", "#d1495b"), ("lightgbm_float", "#8d99ae"), ("logistic_onchain_integer", "#00a6a6")):
        rel = [r for r in out["reliability_heldout"][name] if r[0] is not None]
        ax.plot([r[0] for r in rel], [r[1] for r in rel], marker="o", ms=3, color=color, label=f"{name} (ECE {res[name]['ece']:.3f})")
    ax.set_xlabel("predicted P(A wins)")
    ax.set_ylabel("observed A win rate")
    ax.set_title("Reliability, held-out matches")
    ax.legend(fontsize=7, loc="upper left")
    fig.tight_layout()
    fig.savefig(OUT / "reliability.png")
    for k, v in res.items():
        print(f"{k:28s} brier {v['brier']:.4f}  logloss {v['log_loss']:.4f}  ece {v['ece']:.4f}")
    print("onchain-vs-float gap", out["onchain_vs_float_abs_gap"])
    print("metrics_hash", out["metrics_hash"], f"({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
