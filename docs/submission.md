# Solana Blitz v10 submission: Ringside

Paste-ready text for build.magicblock.app/?stage=blitz#submit. Numbers come from `eval/results/results.json`.

## Payout wallet

PENDING

## Project name

Ringside

## Description

Ringside is an in-play betting exchange that can't be courtsided: the fight and the order book live in the same MagicBlock rollup, so every price is as fresh as the last punch.

Two staked players fight a 90-second duel that runs fully onchain on a Private Ephemeral Rollup. A crank advances the fight every 100 ms, and the same instruction re-prices a "who wins" book from the new state with an integer win-probability model. Every order carries the tick it was priced on; anything more than 2 ticks stale is rejected by the program. Spectator positions stay sealed in the TEE until the bell, power-ups come from VRF, payouts move as Ephemeral SPL balances, and a Magic Action writes a MatchRecord receipt to Solana.

Same bot, same 11 held-out matches, 5 s TV delay: the courtsider made +4.38 per match on the delayed book and +0.00 on Ringside, where 1283 of its stale orders were rejected onchain. Every match replays bit for bit in the browser from its VRF seeds and inputs.

## Categories

Games, DeFi, Consumer

## Website

https://ringside.prashantthakur.dev

## GitHub repository

https://github.com/Prashant-thakur77/ringside

## Pitch and demo video

PENDING

## Explorer link (integration proof)

VRF callback that spawned a power-up wave: https://explorer.solana.com/tx/WEuv5cCWGbG5bgwQrFU8Yu8UjX77vXc3cS8NDmimyPn7j61J1W7ibNXuKxq5GZQLRTqDB5iTsKUfDoqvGqup9A5?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app

Settlement runs inside the crank (tick, then settle) on the private rollup; the reveal of sealed positions that follows it: https://explorer.solana.com/tx/2tLKFwJ1tLYGxAYFioZsZ9kDJok5QDDvVJsfqnkqsfmXcWra8MkWq9KM1ds9rKY5ELYrcJrkR2WuXtGjN7cehMft?cluster=custom&customUrl=https%3A%2F%2Fdevnet-tee.magicblock.app. The MatchRecord it wrote on L1: https://explorer.solana.com/address/A7x8dRinneeA9CCn41KvAFdPb5D5jub5dwiKtyWFEmrW?cluster=devnet

## Onchain program

`4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej`

## Fee vault

House vault owner (Config PDA): `Gn2PTrRkfkFpvy3oU7FNMwSsPvaQ9fg61SoKeKMR4UqK`

## X / Telegram

PENDING

## X post

Sportsbooks freeze in-play markets because faster watchers pick off stale prices. Ringside puts the fight and the order book in one @magicblock rollup: same bot, 5 s TV delay, +4.38 per match on a delayed book, +0.00 on Ringside. Play or trade a live fight from your phone: https://ringside.prashantthakur.dev

## Builder directory blurb

Ringside: a real-time 1v1 duel and its in-play order book in one MagicBlock Private ER. The tick that moves the fight also re-prices the book, stale orders are rejected onchain, positions stay sealed until the bell, and every match replays and verifies in the browser.
