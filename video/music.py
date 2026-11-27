#!/usr/bin/env python3
"""Ringside's score, synthesised in numpy (no samples, nothing licensed). 116 bpm, A minor (Am F C G).

  intro      heartbeat kick + low pad, a riser into the logo
  logo       the drop: full kit, bass, arp
  product    steady pulse (kick, bass, hats) under the voice
  arch       pad + arp only
  proof      builds bar by bar, claps enter
  recap      full
  end        pad resolves on A major, kit stops

  python3 music.py [--out PATH]
"""
import json, sys, wave
from pathlib import Path
import numpy as np

SR = 48000
HERE = Path(__file__).resolve().parent
OUT = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else HERE / "audio" / "music.wav"
BPM = 116
BEAT = 60 / BPM
rng = np.random.default_rng(7)
hz = lambda n: 440 * 2 ** ((n - 69) / 12)

film = json.loads((HERE / "film" / "film.json").read_text())
starts, t = {}, 0.0
for s in film["scenes"]:
    starts[s["id"]] = t
    t += s["duration"]
TOTAL = t
N = int((TOTAL + 2) * SR)
L = np.zeros(N); R = np.zeros(N)


def put(x, at, pan=0.0, g=1.0):
    i = int(at * SR)
    if i >= N: return
    x = x[: N - i] * g
    L[i:i + len(x)] += x * (1 - max(0, pan)); R[i:i + len(x)] += x * (1 + min(0, pan))


def kick(v=1.0):
    n = int(0.35 * SR); tt = np.arange(n) / SR
    return v * np.sin(2 * np.pi * (45 * tt + 90 * (1 - np.exp(-tt * 35)) / 35)) * np.exp(-tt * 9)


def hat(v=0.2):
    n = int(0.05 * SR); x = rng.standard_normal(n); x = np.diff(x, prepend=0)
    return v * x * np.exp(-np.arange(n) / SR * 90)


def clap(v=0.35):
    n = int(0.18 * SR); x = rng.standard_normal(n)
    e = np.exp(-np.arange(n) / SR * 25)
    for k in (0.0, 0.012, 0.024):
        e += np.roll(np.exp(-np.arange(n) / SR * 200), int(k * SR)) * 0.6
    return v * np.convolve(x * e, np.ones(6) / 6, "same")


def bass(note, dur, v=0.35):
    n = int(dur * SR); tt = np.arange(n) / SR; f = hz(note)
    x = np.tanh(2.2 * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)))
    return v * x * np.minimum(1, tt * 200) * np.exp(-tt * 3)


def pad(notes, dur, v=0.12, bright=0.25):
    n = int(dur * SR); tt = np.arange(n) / SR; x = np.zeros(n)
    for m in notes:
        for det in (-0.07, 0.0, 0.07):
            f = hz(m + det)
            x += np.sin(2 * np.pi * f * tt) + bright * np.sin(4 * np.pi * f * tt + 0.3)
    att = np.minimum(1, tt / 0.6); rel = np.minimum(1, (dur - tt) / 0.8)
    return v * x / (len(notes) * 3) * att * np.clip(rel, 0, 1)


def pluck(note, v=0.16):
    n = int(0.5 * SR); tt = np.arange(n) / SR; f = hz(note)
    return v * (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(6 * np.pi * f * tt)) * np.exp(-tt * 9)


def riser(dur, v=0.25):
    n = int(dur * SR); tt = np.arange(n) / SR
    x = rng.standard_normal(n); x = np.diff(x, prepend=0)
    return v * x * (tt / dur) ** 2.5 + v * 0.5 * np.sin(2 * np.pi * (180 * tt + 400 * tt ** 2 / dur)) * (tt / dur) ** 2


CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]  # Am F C G
ROOT = [45, 41, 48, 43]
ARP = [[69, 72, 76, 72], [65, 69, 72, 69], [67, 72, 76, 72], [67, 71, 74, 71]]


def energy(at):
    S = starts
    if at < S["i5"]: return 0
    if at < S["what"]: return 3
    if at < S["arch"]: return 1
    if at < S["proof"]: return -1
    if at < S["proof"] + (S["recap"] - S["proof"]) * 0.5: return 1
    if at < S["recap"]: return 2
    if at < S["end"]: return 3
    return -2


bar = 4 * BEAT
nbar = int(TOTAL / bar) + 2
for b in range(nbar):
    t0 = b * bar
    c = b % 4
    e = energy(t0)
    if e == -2:
        continue
    put(pad(CH[c], bar + 0.4, 0.11 if e < 2 else 0.14), t0, 0)
    for k in range(4):
        tb = t0 + k * BEAT
        ek = energy(tb)
        if ek == 0:
            if k in (0, 2):
                put(kick(0.55), tb); put(kick(0.35), tb + 0.18)   # heartbeat
            continue
        if ek >= 1:
            put(kick(0.8), tb)
            for h in (0, 0.5):
                put(hat(0.12 if ek == 1 else 0.17), tb + h * BEAT, 0.4 if h else -0.3)
            put(bass(ROOT[c] - 12 + 12 * (k % 2), BEAT * 0.9, 0.22 if ek == 1 else 0.3), tb + 0.5 * BEAT)
        if ek >= 2 and k in (1, 3):
            put(clap(0.3), tb)
        if ek == -1 or ek >= 2:
            for a in range(2):
                put(pluck(ARP[c][(k * 2 + a) % 4], 0.12 if ek == -1 else 0.15), tb + a * BEAT / 2, 0.3 if a else -0.3)

# riser into the logo drop, and into the recap
put(riser(starts["i5"] - starts["i4"]), starts["i4"], 0, 0.9)
put(riser(2.0), starts["recap"] - 2.0, 0, 0.7)
# the close: A major chord swelling under the end card
put(pad([57, 61, 64, 69], TOTAL - starts["end"] + 1.5, 0.2, 0.4), starts["end"])

out = np.stack([L, R], 1)
b, a = 0.15, 1  # gentle smoothing
for ch in range(2):
    out[:, ch] = np.convolve(out[:, ch], np.ones(3) / 3, "same")
fade = np.minimum(1, np.arange(N) / (0.8 * SR))[:, None]
tail = np.clip((N - np.arange(N)) / (2.5 * SR), 0, 1)[:, None]
out = out * fade * tail
out /= np.max(np.abs(out)) + 1e-9
out *= 10 ** (-1 / 20)
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype(np.int16).tobytes())
print(f"music {N / SR:.1f}s -> {OUT}")
