# Brief: Ringside web app

**Subject.** An in-play "who wins" exchange on a real-time 1v1 duel that runs fully onchain. Two staked fighters, spectators trading A/B shares priced every 100 ms tick from the same rollup state as the fight. Stale fills are rejected onchain; positions stay sealed until the bell.

**Audience.** MagicBlock judges (technical, Solana-native, have seen many hackathon dashboards), crypto-native traders and gamers, and casual spectators who scan a QR on a phone while watching a match on a laptop.

**One job.** Get a visitor from "what is this" to "I am watching a live match and the price is moving with every punch" in under 10 seconds, then to their first trade.

**Primary CTA.** Watch live (lobby) → Buy A / Buy B (match). Secondary: Fight, Judge mode, Verify replay.

**The subject's world.** Boxing and fight broadcasts (scorebug, round clock, lower thirds, ring ropes, the bell, corner colours red and blue); sportsbooks and exchanges (odds boards, price ladders, back/lay, betting slips); racecourse bookmakers (chalkboards, tic-tac hand signals, tote boards); stock tickers and split-flap boards; the TV delay that makes courtsiding possible (a broadcast clock running behind the real one).

**Dials.** Story surfaces (lobby hero, /proof, /docs): CRAZINESS 7, MOTION 6, DENSITY 6, ART 5, PLAY 7, CALM 6. App screens (match, trade panel, replay): CRAZINESS 3, MOTION 3, CALM 8.

**Hard constraints.** Next.js 15 App Router, React 19, TypeScript, Tailwind, PixiJS v8 (arena), uPlot (odds), Framer Motion, wallet-adapter, qrcode.react. Pages: /, /m/[id], /replay/[id], /proof, /docs. Every number on /proof comes from results.json. Phone spectator flow must work at 360 px. Deadline: 27 Nov 2026 14:00 UTC; the web build has roughly 5 hours of that.
