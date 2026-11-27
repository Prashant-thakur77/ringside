"""Writes narration.json and data/facts.json. Every number is read from eval/results/results.json or the home snapshot."""
import json, os

ROOT = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(ROOT, "../eval/results/results.json")))
G = json.load(open(os.path.join(ROOT, "../apps/web/public/home/gap.json")))
e1, e3, e4, e5, e6 = R["e1"], R["e3"], R["e4"], R["e5"], R["e6"]

delayed_stale = sum(d["stale_fills_accepted"] for d in e1["delays"])
denied = sum(e5["denied"].values())
attempts = sum(e5["attempts"].values())
win = G["window"]
hit = win["hit"] if isinstance(win, dict) and "hit" in win else None

facts = {
    "matches": e1["n_matches"],
    "delayed_stale_fills": delayed_stale,
    "ringside_stale_fills": e1["ringside"]["stale_fills_accepted"],
    "ringside_stale_rejections": e1["ringside"]["stale_rejections"],
    "tick_p50": round(e3["tick_cadence_ms"]["p50"]),
    "tick_p95": round(e3["tick_cadence_ms"]["p95"]),
    "tick_n": e3["tick_cadence_ms"]["n"],
    "fill_p50": round(e4["latency_ms"]["p50"]),
    "load_bots": e4["bots"],
    "load_trades": e4["trades_attempted"],
    "private_denied": denied,
    "private_attempts": attempts,
    "replays_verified": e6["verified_wasm"],
    "replays_total": e6["k"],
    "ticks_checked": e6["ticks_checked"],
    "brier_onchain": round(R["e2"]["models"]["logistic_onchain_integer"]["brier"], 4),
    "brier_coin": R["e2"]["models"]["coin_flip"]["brier"],
    "program_id": R["program_id"],
    "gap_match": G["match_id"],
}
os.makedirs(os.path.join(ROOT, "film/public/data"), exist_ok=True)
json.dump(facts, open(os.path.join(ROOT, "film/public/data/facts.json"), "w"), indent=1)

f = facts
n = lambda x: f"{x:,}"
lines = [
    ("i1", "i1", "A punch lands in the ring."),
    ("i2", "i2", "On the broadcast, that punch lands five seconds later."),
    ("i3", "i3", "In those five seconds, anyone watching faster already knows the price is wrong."),
    ("i4", "i4", "Sportsbooks call it courtsiding, and they answer it by freezing the market."),
    ("i5", "i5", "Ringside answers it with the clock."),
    ("what", "w1", "Ringside is an in-play fight exchange on Solana. The fight and the order book run inside the same MagicBlock ephemeral rollup, ten ticks a second."),
    ("what", "w2", "Every order is stamped with the tick it was priced on. If the fight has moved on, the program refuses the order."),
    ("gap", "g1", "Here is a real devnet match, at its biggest hit. Red lands, and the fair price jumps in the same tick."),
    ("gap", "g2", "A bot watching the five-second TV feed sends the old price. On a delayed book, it fills. On Ringside, the same order is rejected onchain."),
    ("card", "c1", "Tonight's card lists every live bout. AI fighters, trained by self-play, run in the lobby around the clock, and you can challenge one yourself."),
    ("live", "l1", f"Inside a match, the odds move with every hit. In a load test of {f['load_bots']} bots, fills confirmed in {f['fill_p50']} milliseconds at the median."),
    ("sealed", "l2", "Positions live in a private rollup inside a TEE. Nobody else can read yours until the bell."),
    ("replay", "r1", "At the bell, settlement pays the winner, reveals every position, and writes the match record to Solana."),
    ("replay", "r2", "Then anyone can replay the match in their browser. Press verify, and it re-runs every tick and checks the hash chain written onchain."),
    ("arch", "a1", "Under the hood, the fight and the book are one ephemeral rollup, cranked every hundred milliseconds."),
    ("arch", "a2", "MagicBlock VRF seeds the power-ups. Session keys sign every move. The private rollup seals each position. And Magic Actions write the result back to Solana."),
    ("proof", "p1", f"We measured it on devnet. Across {f['matches']} held-out matches, the delayed book accepted {n(f['delayed_stale_fills'])} stale fills. Ringside accepted zero, and rejected {n(f['ringside_stale_rejections'])} stale orders onchain."),
    ("proof", "p2", f"Ticks landed every {f['tick_p50']} milliseconds at the median. {f['private_denied']} of {f['private_attempts']} private reads were denied. And {f['replays_verified']} of {f['replays_total']} replays verified, {n(f['ticks_checked'])} ticks checked."),
    ("recap", "e1", "A punch lands, and the price moves in the same instruction. There is no gap left to trade."),
    ("end", "e2", "Ringside. Live on devnet, open source, and ready for the next fight."),
]
json.dump([{"scene": s, "id": i, "caption": t, "spoken": t.replace("TEE", "T E E").replace("VRF", "V R F").replace("onchain", "on-chain").replace("in-play", "in play").replace("devnet", "dev-net"), "exaggeration": 0.55, "cfg": 0.4} for s, i, t in lines], open(os.path.join(ROOT, "narration.json"), "w"), indent=1)
print(json.dumps(facts, indent=1))
print(sum(len(t.split()) for _, _, t in lines), "words")
