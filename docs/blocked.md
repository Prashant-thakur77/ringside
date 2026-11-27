# Blocked on the owner

One line per item: what is needed, exact command or URL, what to click.

- [x] Devnet SOL for deploy and the first evaluation run (10 SOL received 2026-11-27; program, e2e, E1 24 matches, soak, E3–E6 done).
- [ ] More devnet SOL, about 10 SOL (two more faucet rounds after the 8-hour limit resets): each match leaves about 0.09 SOL of delegation rent on L1, so E1 needs about 3 SOL more to reach 50+ held-out matches and the 24/7 lobby burns about 0.09 SOL per match. Open https://faucet.solana.com, sign in with GitHub, paste `DPDuWJGeYAPeZpZ4jiyG5QMpn6hBB9SbUSURFu6xuyoL`, devnet, 5 SOL, "Confirm Airdrop". Then: `RUNNERS=2 MATCHES=16 ./scripts/devnet-all.sh eval` and `./scripts/devnet-all.sh report`.
- [ ] Optional, for stable public indexer/matchmaker URLs instead of temporary trycloudflare ones (they change if this machine restarts): run `cloudflared tunnel login` in a terminal and click Authorize for prashantthakur.dev.
- [ ] For docs/submission.md: your payout wallet address, your X and Telegram handles, and the video URL. Put them in `docs/links.json` as "payout_wallet", "handles", "video", or just tell me.
- [ ] Wallet-in-browser checks (P8.03–P8.14): connect Phantom/Solflare on https://ringside.prashant101007.workers.dev, fund it from the test-dollar mint, trade and fight once. Needs a human with a wallet extension.
