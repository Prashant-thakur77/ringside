#!/usr/bin/env python3
"""Every effect cue from film/film.json -> sfx_cues.json (then tools/sfx_synth.py kit + track)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
film = json.load(open(os.path.join(HERE, "film/film.json")))
cues = []
cue = lambda t, sfx, db, align="peak": cues.append({"t": round(t, 3), "sfx": sfx, "db": db, "align": align})
t = 0.0
for s in film["scenes"]:
    d, ty = s["duration"], s.get("type")
    if s.get("rope"):
        cue(t + 0.25, "whoosh_heavy", -16)
    elif t > 0:
        cue(t - 0.05, "whoosh", -22)
    if ty == "intro":
        b = s["beat"]
        if b == "punch":
            cue(t + 1.0, "punch", -6); cue(t + 1.15, "tick", -14)
        if b == "tv":
            cue(t + d * 0.62, "punch", -14)
        if b == "fast":
            cue(t + d * 0.45 + 16 / 30, "hit", -12)
        if b == "freeze":
            cue(t + d * 0.42 + 0.66, "riser", -16, "end"); cue(t + d * 0.42 + 0.66, "hit", -9)
        if b == "logo":
            cue(t + 0.4, "bell", -6)
    if ty == "sealed":
        for i in range(3):
            cue(t + (24 + i * 14) / 30, "punch", -16)
        cue(t + d * 0.78, "ping", -18)
    if ty == "arch3d":
        for v in (s.get("cues") or {}).values():
            cue(t + v + 0.25, "tick", -18)
    if ty == "tally":
        cue(t + 14 / 30 + 0.6, "hit", -14); cue(t + 30 / 30 + 0.6, "hit", -12)
        s2 = d * s.get("secondAt", 0.55)
        for k in range(3):
            cue(t + s2 / 1 + (4 + k * 10) / 30, "punch", -17)
    if ty == "recap":
        cue(t + 0.2, "riser", -16, "end")
    if ty == "endring":
        cue(t + 0.25, "bell", -8)
    if ty == "screen":
        p = os.path.join(HERE, s["src"].replace(".mp4", ".events.json"))
        if os.path.exists(p):
            for e in json.load(open(p))["events"]:
                et = e["t"] - s.get("trimBefore", 0)
                if e["type"] == "click" and 0 < et < d:
                    cue(t + et, "click", -14)
        if s["id"] == "gap":
            cue(t + 9.3, "hit", -15); cue(t + 12.6, "punch", -11)
    t += d
cues.sort(key=lambda c: c["t"])
json.dump({"duration": round(t, 3), "dir": "audio/sfx", "cues": cues}, open(os.path.join(HERE, "sfx_cues.json"), "w"), indent=1)
print(f"{len(cues)} cues over {t:.1f} s")
