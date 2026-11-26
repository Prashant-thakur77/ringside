# Ringside video: script and shot list

Target length about 3 minutes (the form names no limit). Every number on screen comes from `eval/results/results.json`. Footage is real: screen captures of the live app on devnet, explorer pages and the proof page.

## Script

**0:00 Hook.** A TV broadcast clock sits 5 seconds behind a live duel. On the left, a sportsbook board; a bot labeled "courtsider" keeps buying the fighter who just landed a hit, and its balance climbs. Voice: "Sportsbooks stream five to eight seconds behind the action, and freeze markets because faster watchers pick off stale prices."

**0:12 The same bot on Ringside.** Split screen. The same courtsider sends the same order to Ringside. A red stamp lands: REJECTED · STALE TICK, with the explorer transaction beside it. Voice: "Same bot, same match. On Ringside the order is rejected onchain."

**0:25 What Ringside is.** Lobby, then a live match. Voice: "Ringside is an in-play betting exchange that can't be courtsided. The fight and the order book live in the same MagicBlock rollup, so every price is as fresh as the last punch."

**0:40 Phone.** Point a phone at the QR code on the match screen. One wallet prompt, then the judge buys blue at the price on the board. The fill ticket prints with its tick and latency. Blue lands a comeback; the odds line swings; at the bell the payout lands in the same second.

**1:15 Proof.** The A/B chart: +13.44 per match on the delayed book against +0.62 on Ringside over 89 held-out matches. The reliability diagram: onchain integer model Brier 0.1736 against 0.2500 for a coin flip. Tick cadence p50 100 ms, measured.

**1:45 Sealed until the bell.** A spectator's position read by another wallet: denied. After settle, the same read succeeds. Voice: "Positions stay private inside the TEE until the bell, then everyone can check them."

**2:05 Verify.** The replay page scrubs the match and presses Verify: VERIFIED ✓ stamps in. Voice: "Every match replays bit for bit in your browser from its VRF seeds and inputs, and the hash chain matches the one written onchain."

**2:25 How it works.** The architecture diagram and the primitives table: Ephemeral Rollup, Private ER, VRF, crank, session keys, Ephemeral SPL, Magic Router, Magic Actions, each with what breaks without it.

**2:45 Close.** The lobby with AI fighters running. "Ringside. The first sportsbook that can't be courtsided." Live link and repo on screen.

## Shot list

| # | Shot | Source | Length |
|---|---|---|---|
| 1 | Broadcast clock behind the duel, courtsider draining the delayed board | Judge mode on a live devnet match, TV-delay side, clock overlay | 12 s |
| 2 | Same order rejected on Ringside, stamp + explorer tx | Judge mode Ringside side + local:5LL1F6LuXjT5EmhdQGSxCY5dThSg5PVxYShPA1DeLYQ3C3VJ45EJumLVbdadQM1bBgnHL2NRuxUBQFEFzGByMBBx | 13 s |
| 3 | Lobby → live match, odds line moving | PENDING | 15 s |
| 4 | Phone scan of the QR, onboarding, Buy Blue, fill ticket | Phone screen recording | 35 s |
| 5 | A/B chart and reliability diagram | /proof, eval/results/*.png | 30 s |
| 6 | Privacy read denied, then readable after reveal | eval/e5_privacy.ts terminal output + /m page after the bell | 20 s |
| 7 | Replay scrub and Verify stamp | /replay/<id> | 20 s |
| 8 | Architecture and primitives table | /docs | 20 s |
| 9 | Close on the live lobby, link and repo | / | 15 s |
