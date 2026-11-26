# Solana Blitz v10 submission: Ringside

Paste-ready text for build.magicblock.app/?stage=blitz#submit. Numbers come from `eval/results/results.json`.

## Payout wallet

PENDING

## Project name

Ringside

## Description

Ringside is an in-play betting exchange that can't be courtsided: the fight and the order book live in the same MagicBlock rollup, so every price is as fresh as the last punch.

Two staked players fight a 90-second duel that runs fully onchain on a Private Ephemeral Rollup. A crank advances the fight every 100 ms, and the same instruction re-prices a "who wins" book from the new state with an integer win-probability model. Every order carries the tick it was priced on; anything more than 2 ticks stale is rejected by the program. Spectator positions stay sealed in the TEE until the bell, power-ups come from VRF, payouts move as Ephemeral SPL balances, and a Magic Action writes a MatchRecord receipt to Solana.

Same bot, same 89 held-out matches, 5 s TV delay: the courtsider made +13.44 per match on the delayed book and +0.62 on Ringside, where 1011 of its stale orders were rejected onchain. Every match replays bit for bit in the browser from its VRF seeds and inputs.

## Categories

Games, DeFi, Consumer

## Website

PENDING

## GitHub repository

https://github.com/Prashant-thakur77/ringside

## Pitch and demo video

PENDING

## Explorer link (integration proof)

VRF callback that spawned a power-up wave: PENDING

Settlement with reveal of sealed positions: local:38ZshAWEKazf7fc3F8wUmCfgtKkJ77ADFN5Jth4RCq8amwb9QH3HT2Li4DSNWgtkPuJBHjyX1PAjdcCi8EnfLPMi

## Onchain program

`4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej`

## Fee vault

House vault owner (Config PDA): `Gn2PTrRkfkFpvy3oU7FNMwSsPvaQ9fg61SoKeKMR4UqK`

## X / Telegram

PENDING

## X post

Sportsbooks freeze in-play markets because faster watchers pick off stale prices. Ringside puts the fight and the order book in one @magicblock rollup: same bot, 5 s TV delay, +13.44 per match on a delayed book, +0.62 on Ringside. Play or trade a live fight from your phone: PENDING

## Builder directory blurb

Ringside: a real-time 1v1 duel and its in-play order book in one MagicBlock Private ER. The tick that moves the fight also re-prices the book, stale orders are rejected onchain, positions stay sealed until the bell, and every match replays and verifies in the browser.
