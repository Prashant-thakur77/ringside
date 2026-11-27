"""Writes film/film.json (scene order, pictures, labels). Durations come from vo_timeline.py --write."""
import json, os
ROOT = os.path.dirname(os.path.abspath(__file__))
old = {}
p = os.path.join(ROOT, "film/film.json")
if os.path.exists(p):
    old = {s["id"]: s.get("duration", 5) for s in json.load(open(p))["scenes"]}
SITE = "the Ringside site · devnet data"
fade = {"type": "fade", "dur": 0.4}
S = [
 {"id": "i1", "type": "intro", "beat": "punch", "min": 4.4, "backdrop": False, "label": {"text": "illustration"}, "transition": {"type": "cut"}},
 {"id": "i2", "type": "intro", "beat": "tv", "min": 5.4, "backdrop": False, "transition": {"type": "slide", "dur": 0.5, "dir": "from-right"}},
 {"id": "i3", "type": "intro", "beat": "fast", "min": 5.4, "backdrop": False, "transition": {"type": "wipe", "dur": 0.5, "dir": "from-bottom"}},
 {"id": "i4", "type": "intro", "beat": "freeze", "min": 5.4, "backdrop": False, "transition": {"type": "cut"}},
 {"id": "i5", "type": "intro", "beat": "logo", "min": 4.6, "backdrop": False, "rope": True, "transition": {"type": "zoom", "dur": 0.5}},
 {"id": "what", "type": "screen", "src": "captures/HOME.mp4", "trimBefore": 0.3, "full": True, "rope": True, "label": {"text": SITE}, "transition": fade,
  "zooms": [{"at": 0.4, "dur": 3.6, "box": {"x": 40, "y": 180, "w": 1000, "h": 560}, "scale": 1.35}]},
 {"id": "gap", "type": "screen", "src": "captures/GAP.mp4", "trimBefore": 3.2, "full": True, "label": {"text": "recorded devnet match · biggest hit"}, "transition": fade,
  "zooms": [{"at": 0.6, "dur": 5.0, "box": {"x": 60, "y": 360, "w": 1760, "h": 260}, "scale": 1.25},
            {"at": 8.0, "dur": 6.0, "box": {"x": 60, "y": 560, "w": 1180, "h": 460}, "scale": 1.5}]},
 {"id": "card", "type": "screen", "src": "captures/CARD.mp4", "trimBefore": 3.4, "full": True, "label": {"text": SITE}, "transition": {"type": "slide", "dur": 0.5, "dir": "from-bottom"}},
 {"id": "live", "type": "screen", "src": "captures/CHAP.mp4", "trimBefore": 1.6, "full": True, "label": {"text": SITE}, "transition": fade,
  "zooms": [{"at": 3.2, "dur": 4.5, "box": {"x": 60, "y": 200, "w": 1800, "h": 680}, "scale": 1.2}]},
 {"id": "sealed", "type": "sealed", "min": 6.2, "backdrop": False, "label": {"text": "illustration · result from devnet privacy test"}, "transition": fade},
 {"id": "replay", "type": "screen", "src": "captures/REPLAY.mp4", "trimBefore": 0.4, "full": True, "label": {"text": SITE + " · replay of a settled match"}, "transition": fade,
  "zooms": [{"at": 6.8, "dur": 7.4, "box": {"x": 1080, "y": 360, "w": 720, "h": 300}, "scale": 1.7}]},
 {"id": "arch", "type": "arch3d", "title": "Under the hood", "min": 15, "cues": {"l1": 0.4, "er": 2.6, "vrf": 7.2, "sk": 9.0, "tee": 10.9, "act": 12.9}, "rope": True, "transition": fade,
  "layers": [
   {"id": "l1", "label": "Solana devnet", "sub": "program, escrow, match record"},
   {"id": "er", "label": "Ephemeral Rollup", "sub": "fight + order book in one state · cranked every 100 ms"},
   {"id": "vrf", "label": "MagicBlock VRF", "sub": "seeds the power-ups"},
   {"id": "sk", "label": "Session keys", "sub": "sign every move and trade"},
   {"id": "tee", "label": "Private rollup · TEE", "sub": "positions sealed until the bell"},
   {"id": "act", "label": "Magic Actions", "sub": "commit + write the result to Solana"}]},
 {"id": "proof", "type": "tally", "secondAt": 0.53, "min": 14, "backdrop": False, "rope": True, "transition": fade},
 {"id": "recap", "type": "recap", "backdrop": False, "lines": ["A punch lands.", "The price moves in the same instruction.", "No gap left to trade."], "transition": {"type": "zoom", "dur": 0.5}},
 {"id": "end", "type": "endring", "min": 6.5, "backdrop": False, "links": ["ringside.prashantthakur.dev", "github.com/Prashant-thakur77/ringside"]},
]
for s in S:
    s["duration"] = old.get(s["id"], s.get("min", 6))
film = {"title": "Ringside", "fps": 30, "width": 1920, "height": 1080,
        "theme": {"bg": "#0b0c14", "surface": "#171925", "fg": "#f3eee4", "muted": "#a7a2b0", "accent": "#f4845f", "accent2": "#e7d5bd", "good": "#3fbf8a", "bad": "#ff5a4e"},
        "captions": "captions/captions.json", "scenes": S}
json.dump(film, open(p, "w"), indent=1)
print(len(S), "scenes")
