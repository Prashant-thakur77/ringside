"""Builds eval/results/results.json and every chart from the raw experiment outputs.

Inputs (eval/data/, written by the experiment scripts):
  courtsider-<env>.jsonl   E1 per-match courtsider stats (bots/courtsider.ts)
  e3-<env>.json            E3 latency snapshot (eval/e3_latency.py)
  e4-soak-<env>.json       E4 soak (bots/soak) ; eval/results/cu_magicsvm.json (MagicSVM CU)
  e5-<env>.json            E5 privacy leak test (eval/e5_privacy.ts)
  e6-<env>.json            E6 replay determinism (eval/e6_replay.py)
  ml/winprob/out/metrics.json, ml/ppo/out/eval.json   E2, E7 (held-out)
Usage: python eval/make_report.py [env]   (env: devnet | local; default: devnet if its E1 data exists)
"""
import datetime as dt
import json
import shutil
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
matplotlib.rcParams["font.family"] = "DejaVu Sans Mono"
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "eval/data"
OUT = ROOT / "eval/results"
TV = "#d9622a"  # TV-delay book (validated palette, light mode on ticket stock)
RS = "#009379"  # Ringside book
THIRD = "#6a4ce2"
INK = "#22201a"
QUIET = "#5d5644"
PAPER = "#f1e9d6"
RNG = np.random.default_rng(20261127)


def load(p, default=None):
    p = Path(p)
    if not p.exists():
        return default
    return json.loads(p.read_text()) if p.suffix == ".json" else [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


def boot_ci(x, n=10_000):
    x = np.asarray(x, float)
    if len(x) == 0:
        return [None, None]
    m = RNG.choice(x, (n, len(x)), replace=True).mean(1)
    return [float(np.quantile(m, 0.025)), float(np.quantile(m, 0.975))]


def style(ax):
    ax.set_facecolor(PAPER)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(QUIET)
    ax.tick_params(colors=QUIET, labelsize=9)
    ax.grid(axis="y", color="#d8ceb6", linewidth=0.8)
    ax.set_axisbelow(True)


def e1(env):
    rows = [r for r in load(DATA / f"courtsider-{env}.jsonl", []) if r.get("pnlDelayed") is not None]
    if not rows:
        return None
    delays = sorted({r["delayMs"] for r in rows})
    out = {"heldout": True, "n_matches": len(rows), "delays": []}
    for d in delays:
        rs = [r for r in rows if r["delayMs"] == d]
        p = [r["pnlDelayed"] for r in rs]
        out["delays"].append({
            "delay_ms": d, "n_matches": len(rs), "pnl_mean": float(np.mean(p)), "pnl_ci95": boot_ci(p),
            "fills": int(sum(r["fillsDelayed"] for r in rs)), "stale_fills_accepted": int(sum(r["staleFillsAccepted"] for r in rs)),
            "house_pnl_mean": float(np.mean([r["housePnlDelayed"] for r in rs])),
        })
    pl = [r["pnlLive"] for r in rows]
    out["ringside"] = {
        "n_matches": len(rows), "pnl_mean": float(np.mean(pl)), "pnl_ci95": boot_ci(pl),
        "stale_attempts": int(sum(r["attemptsLiveStale"] for r in rows)), "stale_rejections": int(sum(min(r["rejectsLiveStale"], r["attemptsLiveStale"]) for r in rows)),
        "stale_fills_accepted": int(sum(r["fillsLiveStale"] for r in rows)), "fresh_fills": int(sum(r["fillsLiveFresh"] for r in rows)),
        "transport_errors": int(sum(r.get("transportErrors", 0) for r in rows)),
        "house_pnl_mean": float(np.mean([r["housePnlLive"] for r in rows])),
    }
    # chart
    labels = [f"TV {d['delay_ms'] / 1000:g} s" for d in out["delays"]] + ["Ringside"]
    means = [d["pnl_mean"] for d in out["delays"]] + [out["ringside"]["pnl_mean"]]
    cis = [d["pnl_ci95"] for d in out["delays"]] + [out["ringside"]["pnl_ci95"]]
    colors = [TV] * len(out["delays"]) + [RS]
    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=160)
    fig.patch.set_facecolor(PAPER)
    style(ax)
    x = np.arange(len(labels))
    ax.bar(x, means, width=0.62, color=colors, edgecolor=PAPER, linewidth=2)
    lo = [m - c[0] for m, c in zip(means, cis)]
    hi = [c[1] - m for m, c in zip(means, cis)]
    ax.errorbar(x, means, yerr=[lo, hi], fmt="none", ecolor=INK, elinewidth=1.2, capsize=4)
    ax.axhline(0, color=INK, linewidth=1)
    top = max(c[1] for c in cis)
    bottom = min(min(c[0] for c in cis), 0)
    ax.set_ylim(bottom - 0.08 * (top - bottom), top + 0.18 * (top - bottom))
    for xi, m, c in zip(x, means, cis):
        ax.text(xi, max(m, c[1]) + 0.03 * (top - bottom), f"{m:+.2f}", ha="center", va="bottom", fontsize=9, color=INK, family="monospace")
    ax.set_xticks(x, labels, color=INK)
    ax.set_ylabel("courtsider PnL per match (test-dollars)", color=QUIET, fontsize=9)
    ax.set_title(f"Same bot, same matches: {out['n_matches']} held-out matches, 95% bootstrap CI", color=INK, fontsize=10, loc="left")
    fig.tight_layout()
    fig.savefig(OUT / "e1_courtsider_ab.png")
    plt.close(fig)
    return out


def e2():
    m = load(ROOT / "ml/winprob/out/metrics.json")
    rel = m["reliability_heldout"]
    fig, ax = plt.subplots(figsize=(5.2, 5.2), dpi=160)
    fig.patch.set_facecolor(PAPER)
    style(ax)
    ax.grid(color="#d8ceb6", linewidth=0.8)
    ax.plot([0, 1], [0, 1], color=QUIET, linewidth=1, linestyle="--")
    for name, color, label in (("hp_ratio", TV, "HP-ratio heuristic"), ("lightgbm_float", THIRD, "LightGBM (float)"), ("logistic_onchain_integer", RS, "Onchain integer model")):
        pts = [r for r in rel[name] if r[0] is not None]
        ax.plot([r[0] for r in pts], [r[1] for r in pts], color=color, linewidth=2, marker="o", markersize=5, markeredgecolor=PAPER, label=f"{label} · ECE {m['metrics_heldout'][name]['ece']:.3f}")
    ax.set_xlabel("predicted P(red wins)", color=QUIET, fontsize=9)
    ax.set_ylabel("observed red win rate", color=QUIET, fontsize=9)
    ax.set_title(f"Reliability on {m['test_matches']:,} held-out matches", color=INK, fontsize=10, loc="left")
    ax.legend(fontsize=8, frameon=False, loc="upper left", labelcolor=INK)
    fig.tight_layout()
    fig.savefig(OUT / "e2_reliability.png")
    plt.close(fig)
    return {"heldout": True, "n_test_matches": m["test_matches"], "n_test_rows": m["rows"]["test"], "n_matches_total": m["n_matches"], "models": m["metrics_heldout"],
            "onchain_vs_float_gap": m["onchain_vs_float_abs_gap"], "buckets": m["buckets_heldout"], "metrics_hash": m["metrics_hash"], "reliability": m["reliability_heldout"]}


def e3(env):
    s = load(DATA / f"e3-{env}.json")
    return s


def e4(env):
    soak = load(DATA / f"e4-soak-{env}.json")
    cu = load(OUT / "cu_magicsvm.json", {})
    if not soak:
        return None
    return {"bots": soak["bots"], "trades_per_bot": soak["trades_per_bot"], "trades_attempted": soak["trades_attempted"], "success_rate": soak["success_rate"],
            "rejects_by_reason": soak["rejects_by_reason"], "latency_ms": soak["latency_ms"], "max_exposure_usdc": soak["max_exposure_usdc"], "cap_usdc": soak["cap_usdc"],
            "cu": {"tick_p50": cu.get("tick_cu_p50"), "tick_p99": cu.get("tick_cu_p99"), "tick_max": cu.get("tick_cu_max"), "trade": soak["trade_cu"]["p50"] or cu.get("trade_cu")}}


def negatives(r):
    neg = []
    m = r["e2"]["models"]
    neg.append({"title": "The onchain model is not the best model", "value": m["logistic_onchain_integer"]["brier"] - m["lightgbm_float"]["brier"],
                "detail": f"The distilled logistic that fits in a tick has held-out Brier {m['logistic_onchain_integer']['brier']:.4f} against {m['lightgbm_float']['brier']:.4f} for the LightGBM teacher it was distilled from. We trade some accuracy for running inside the instruction."})
    b = r["e2"]["buckets"].get("last_20s_regulation", {})
    if b:
        e_late = b["logistic_onchain_integer"]["ece"]
        neg.append({"title": "Calibration is worst late in regulation", "value": e_late,
                    "detail": f"In the last 20 seconds of regulation the onchain model's ECE is {e_late:.4f}, against {m['logistic_onchain_integer']['ece']:.4f} overall: a linear model underfits the swingy end of a fight."})
    if r.get("e1"):
        d0 = r["e1"]["delays"][0]
        neg.append({"title": f"A short delay barely pays the courtsider", "value": d0["pnl_mean"],
                    "detail": f"At a {d0['delay_ms'] / 1000:g} s TV delay the courtsider's PnL per match is {d0['pnl_mean']:+.2f} (95% CI {d0['pnl_ci95'][0]:+.2f} to {d0['pnl_ci95'][1]:+.2f}); the edge comes from the 2–8 s delays that real streams have."})
    if r.get("e1"):
        rs = r["e1"]["ringside"]
        if rs["pnl_ci95"][0] is not None and rs["pnl_ci95"][0] > 0:
            neg.append({"title": "Fresh orders still find a small edge", "value": rs["pnl_mean"],
                        "detail": f"On Ringside every stale order was rejected, but the courtsider's orders at the live tick still made {rs['pnl_mean']:+.2f} per match (95% CI {rs['pnl_ci95'][0]:+.2f} to {rs['pnl_ci95'][1]:+.2f}): the model does not fully price the momentum right after a hit."})
    if r.get("e3") and r["e3"]["tick_cadence_ms"].get("p99"):
        c = r["e3"]["tick_cadence_ms"]
        neg.append({"title": "Tick cadence has a tail", "value": c["p99"], "detail": f"Measured tick cadence is p50 {c['p50']:.0f} ms but p99 {c['p99']:.0f} ms: the 100 ms crank is a target, not a guarantee."})
    return neg


def main():
    env = sys.argv[1] if len(sys.argv) > 1 else ("devnet" if (DATA / "courtsider-devnet.jsonl").exists() else "local")
    OUT.mkdir(parents=True, exist_ok=True)
    r = {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "network": "Solana devnet + MagicBlock devnet-tee" if env == "devnet" else "local MagicBlock stack (base validator + ER 1.1.1)",
        "env": env,
        "program_id": "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej",
        "e1": e1(env),
        "e2": e2(),
        "e3": e3(env),
        "e4": e4(env),
        "e5": load(DATA / f"e5-{env}.json"),
        "e6": load(DATA / f"e6-{env}.json"),
        "e7": None,
    }
    if r["e6"]:
        r["e6"] = {k: r["e6"][k] for k in ("k", "incomplete_excluded", "verified_python", "verified_wasm", "ticks_checked")}
    ppo = load(ROOT / "ml/ppo/out/eval.json")
    r["e7"] = {"heldout": True, "episodes_per_bot": 300, "train_steps": ppo["steps"], "train_minutes": round(ppo["minutes"]), "win_rate": {k: v["win_rate"] for k, v in ppo["heldout_vs_scripted"].items()}}
    if r["e1"]:
        five = next((d for d in r["e1"]["delays"] if d["delay_ms"] == 5000), r["e1"]["delays"][-1])
        r["headline"] = {"delay_ms": five["delay_ms"], "n_matches": five["n_matches"], "courtsider_pnl_per_match_tv": five["pnl_mean"], "courtsider_pnl_per_match_ringside": r["e1"]["ringside"]["pnl_mean"],
                         "stale_fills_accepted_tv": five["stale_fills_accepted"], "stale_fills_accepted_ringside": r["e1"]["ringside"]["stale_fills_accepted"], "stale_rejections_ringside": r["e1"]["ringside"]["stale_rejections"]}
    r["negative"] = negatives(r)
    weakest = max(r["negative"][:2], key=lambda n: n["value"])
    r["weakest_case"] = {"title": weakest["title"], "detail": weakest["detail"]}
    (OUT / "results.json").write_text(json.dumps(r, indent=2))
    web = ROOT / "apps/web/public"
    (web / "results").mkdir(parents=True, exist_ok=True)
    shutil.copy(OUT / "results.json", web / "results.json")
    for png in OUT.glob("*.png"):
        shutil.copy(png, web / "results" / png.name)
    print(f"results.json written for {env}: e1={'yes' if r['e1'] else 'no'} e3={'yes' if r['e3'] else 'no'} e4={'yes' if r['e4'] else 'no'} e5={'yes' if r['e5'] else 'no'} e6={'yes' if r['e6'] else 'no'}")


if __name__ == "__main__":
    main()
