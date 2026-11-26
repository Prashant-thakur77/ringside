# Blocked on the owner

One line per item: what is needed, exact command or URL, what to click.

- [ ] Devnet SOL for the admin wallet, about 15 SOL in total (program rent 3.8 SOL, about 7.7 SOL peak while deploying, about 0.035 SOL rent per match for ~130 evaluation matches, bot fees; airdrop is rate-limited): open https://faucet.solana.com, sign in with GitHub, paste `DPDuWJGeYAPeZpZ4jiyG5QMpn6hBB9SbUSURFu6xuyoL`, choose devnet, request 5 SOL, click "Confirm Airdrop"; repeat until the balance is about 15 (`solana balance -u devnet DPDuWJGeYAPeZpZ4jiyG5QMpn6hBB9SbUSURFu6xuyoL`). Everything devnet-side (deploy, E1, E3–E6, explorer links, Vercel) starts automatically after that.
- [ ] Optional, for a stable public indexer URL instead of a temporary trycloudflare one: run `cloudflared tunnel login` in a terminal and click Authorize for prashantthakur.dev in the browser window it opens.
- [ ] For docs/submission.md: your payout wallet address, your X and Telegram handles, and (later) the video URL. Put them in `docs/links.json` as "payout_wallet", "handles", "video", or just tell me.
