"""PPO fighters (single file, CleanRL-style) trained by self-play against a league of past
checkpoints plus the scripted bots, on the Rust simulation through the PyO3 VecEnv at a 10 Hz
decision rate (one action per 100 ms tick).

Observation: 16 pricing features + 6 relative-position/velocity terms (22 floats).
Action: 9 moves × fire × dash × shield = 72 discrete actions (aim tracks the opponent).

Usage: python ml/ppo/train.py --minutes 60
Outputs: ml/ppo/out/{policy.pt, policy.onnx, league/*.pt, train_log.csv, eval.json}
"""
import argparse
import csv
import json
import time
from pathlib import Path

import numpy as np
import ringside_sim as rs
import torch
import torch.nn as nn

OUT = Path(__file__).resolve().parent / "out"
SCRIPTED = {0: "aggressive", 1: "kiting", 2: "defensive", 3: "random"}
EXTERNAL = 4


class Policy(nn.Module):
    def __init__(self, obs_dim: int, n_actions: int, hidden: int = 128):
        super().__init__()
        self.body = nn.Sequential(nn.Linear(obs_dim, hidden), nn.Tanh(), nn.Linear(hidden, hidden), nn.Tanh())
        self.pi = nn.Linear(hidden, n_actions)
        self.v = nn.Linear(hidden, 1)
        nn.init.orthogonal_(self.pi.weight, 0.01)
        nn.init.zeros_(self.pi.bias)

    def forward(self, x):
        h = self.body(x)
        return self.pi(h), self.v(h).squeeze(-1)


class LogitsOnly(nn.Module):
    """Export wrapper: obs → action logits."""

    def __init__(self, p: Policy):
        super().__init__()
        self.p = p

    def forward(self, obs):
        return self.p(obs)[0]


def evaluate(policy: Policy, episodes: int = 300, seed: int = 99_0001) -> dict:
    """Win rate vs each scripted bot on held-out seeds (odd match seeds, never used in training)."""
    out = {}
    policy.eval()
    for pid, name in SCRIPTED.items():
        env = rs.VecEnv(50, seed + pid, True, True)
        for i in range(50):
            env.set_opponent(i, pid, 850)
        obs = env.reset_all()
        wins = losses = draws = done_eps = 0
        while done_eps < episodes:
            with torch.no_grad():
                logits, _ = policy(torch.as_tensor(obs))
            a = logits.argmax(-1).numpy().astype(np.int64)
            obs, _, done, outcome = env.step(a, np.full(50, -1, dtype=np.int64))
            for d, o in zip(done, outcome):
                if d:
                    done_eps += 1
                    wins += o > 0
                    losses += o < 0
                    draws += o == 0
        n = wins + losses + draws
        out[name] = {"win_rate": wins / n, "loss_rate": losses / n, "draw_rate": draws / n, "episodes": int(n)}
    policy.train()
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=60)
    ap.add_argument("--envs", type=int, default=128)
    ap.add_argument("--steps", type=int, default=128)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()
    torch.manual_seed(args.seed)
    torch.set_num_threads(8)
    rng = np.random.default_rng(args.seed)
    (OUT / "league").mkdir(parents=True, exist_ok=True)

    n = args.envs
    env = rs.VecEnv(n, args.seed * 7919, True, False)
    obs_dim, n_act = env.obs_dim, env.n_actions
    agent = Policy(obs_dim, n_act)
    opt = torch.optim.Adam(agent.parameters(), lr=args.lr, eps=1e-5)
    league: list[Policy] = []

    def assign_opponents():
        # 60% scripted (skill 700..1000), 40% league snapshots once the league exists.
        kinds = np.zeros(n, dtype=np.int64)
        for i in range(n):
            if league and rng.random() < 0.4:
                env.set_opponent(i, EXTERNAL, 0)
                kinds[i] = 1 + rng.integers(len(league))
            else:
                env.set_opponent(i, int(rng.integers(4)), int(rng.integers(700, 1001)))
        return kinds

    opp_kind = assign_opponents()
    obs = torch.as_tensor(env.reset_all())
    gamma, lam, clip, ent_coef, vf_coef = 0.995, 0.95, 0.2, 0.01, 0.5
    T = args.steps
    b_obs = torch.zeros(T, n, obs_dim)
    b_act = torch.zeros(T, n, dtype=torch.long)
    b_logp = torch.zeros(T, n)
    b_rew = torch.zeros(T, n)
    b_done = torch.zeros(T, n)
    b_val = torch.zeros(T, n)
    t0 = time.time()
    update = 0
    steps = 0
    recent = []
    log = open(OUT / "train_log.csv", "w", newline="")
    wr = csv.writer(log)
    wr.writerow(["update", "steps", "minutes", "win_rate_recent", "pg_loss", "v_loss", "entropy", "league"])
    while time.time() - t0 < args.minutes * 60:
        for t in range(T):
            with torch.no_grad():
                logits, v = agent(obs)
                dist = torch.distributions.Categorical(logits=logits)
                a = dist.sample()
                opp_a = np.full(n, -1, dtype=np.int64)
                if league and (opp_kind > 0).any():
                    oo = torch.as_tensor(env.opp_obs())
                    for k in np.unique(opp_kind[opp_kind > 0]):
                        idx = np.where(opp_kind == k)[0]
                        lg, _ = league[k - 1](oo[idx])
                        opp_a[idx] = torch.distributions.Categorical(logits=lg).sample().numpy()
            b_obs[t], b_act[t], b_logp[t], b_val[t] = obs, a, dist.log_prob(a), v
            o2, r, d, outcome = env.step(a.numpy().astype(np.int64), opp_a)
            b_rew[t] = torch.as_tensor(r)
            b_done[t] = torch.as_tensor(d.astype(np.float32))
            for i in np.where(d)[0]:
                recent.append(float(outcome[i] > 0))
            obs = torch.as_tensor(o2)
            steps += n
        with torch.no_grad():
            _, next_v = agent(obs)
        adv = torch.zeros(T, n)
        last = torch.zeros(n)
        for t in reversed(range(T)):
            nv = next_v if t == T - 1 else b_val[t + 1]
            nonterm = 1.0 - b_done[t]
            delta = b_rew[t] + gamma * nv * nonterm - b_val[t]
            last = delta + gamma * lam * nonterm * last
            adv[t] = last
        ret = adv + b_val
        fo, fa, fl, fadv, fret = (x.reshape(T * n, *x.shape[2:]) for x in (b_obs, b_act, b_logp, adv, ret))
        fadv = (fadv - fadv.mean()) / (fadv.std() + 1e-8)
        idx = np.arange(T * n)
        for _ in range(4):
            rng.shuffle(idx)
            for s in range(0, T * n, 4096):
                mb = torch.as_tensor(idx[s : s + 4096])
                logits, v = agent(fo[mb])
                dist = torch.distributions.Categorical(logits=logits)
                ratio = (dist.log_prob(fa[mb]) - fl[mb]).exp()
                pg = torch.max(-fadv[mb] * ratio, -fadv[mb] * ratio.clamp(1 - clip, 1 + clip)).mean()
                vl = 0.5 * ((v - fret[mb]) ** 2).mean()
                ent = dist.entropy().mean()
                loss = pg + vf_coef * vl - ent_coef * ent
                opt.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(agent.parameters(), 0.5)
                opt.step()
        update += 1
        if update % 20 == 0:
            snap = Policy(obs_dim, n_act)
            snap.load_state_dict(agent.state_dict())
            snap.eval()
            league.append(snap)
            league = league[-8:]
            torch.save(agent.state_dict(), OUT / "league" / f"u{update:05d}.pt")
            opp_kind = assign_opponents()
        wr_recent = float(np.mean(recent[-2000:])) if recent else 0.0
        wr.writerow([update, steps, round((time.time() - t0) / 60, 2), round(wr_recent, 4), float(pg), float(vl), float(ent), len(league)])
        log.flush()
        if update % 10 == 0:
            print(f"update {update} steps {steps} min {(time.time() - t0) / 60:.1f} recent win {wr_recent:.3f} ent {float(ent):.3f}", flush=True)

    torch.save(agent.state_dict(), OUT / "policy.pt")
    agent.eval()
    torch.onnx.export(LogitsOnly(agent), torch.zeros(1, obs_dim), OUT / "policy.onnx", input_names=["obs"], output_names=["logits"], dynamic_axes={"obs": {0: "batch"}, "logits": {0: "batch"}}, opset_version=17)
    ev = evaluate(agent)
    json.dump({"steps": steps, "updates": update, "minutes": (time.time() - t0) / 60, "heldout_vs_scripted": ev, "obs_dim": obs_dim, "n_actions": n_act}, open(OUT / "eval.json", "w"), indent=2)
    print(json.dumps(ev, indent=2))


if __name__ == "__main__":
    main()
