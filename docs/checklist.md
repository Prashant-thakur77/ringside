# Ringside build checklist

Every concrete item from RINGSIDE_PLAN.md. Format: `- [ ] ID · item — acceptance test`.
Ticked only after the acceptance test passed and its output was pasted into docs/progress.md.

## Phase 0 — Setup and capability spike (devnet-tee)

- [x] P0.01 · Repo initialised, first commit is `.gitignore` only — `git show --stat HEAD~N` for the root commit lists only `.gitignore`
- [x] P0.02 · Toolchain pinned: Solana CLI 3.1.9, Rust 1.89.0 (programs), Anchor 1.0.2, Node 24.10.0 — `solana --version`, `anchor --version`, `rustup run 1.89.0 rustc -V`, `node -v` print the pinned versions
- [ ] P0.03 · `rust-toolchain.toml`, `.nvmrc`, `Anchor.toml` pin versions — files exist and `anchor build` uses them
- [ ] P0.04 · Admin, relay, keeper and bot keypairs in `keys/` (gitignored) — `git check-ignore keys/admin.json` succeeds
- [ ] P0.05 · Admin wallet funded with devnet SOL — `solana balance` ≥ 5 SOL on devnet
- [ ] P0.06 · `.env.example` with every variable from plan §13 — file lists all 16 variables
- [ ] P0.07 · Spike program `spike` builds with ephemeral-rollups-sdk 0.18 (anchor + access-control + vrf) — `anchor build -p spike` exit 0
- [ ] P0.08 · Spike 1: delegate PDA to TEE validator, create permission + set private — devnet tx signatures recorded in docs/spike.md
- [ ] P0.09 · Spike 1: member read with token succeeds; non-member read fails; after flip to public the read succeeds — script output in docs/spike.md
- [ ] P0.10 · Spike 2: `ScheduleTask` crank on TEE at 100 ms × 50 → measured cadence p50/p95 — numbers in docs/spike.md; Switch A recorded
- [ ] P0.11 · Spike 3: VRF request on ephemeral queue from TEE, callback observed — callback tx in docs/spike.md; Switch B recorded
- [ ] P0.12 · Spike 4: `delegateSpl` devnet USDC (or test-dollar) to TEE eATA + PDA-signed transfer on TEE — tx signatures in docs/spike.md
- [ ] P0.13 · Spike 5: session token accepted by an instruction executing on TEE — tx signature in docs/spike.md
- [ ] P0.14 · docs/spike.md complete with Switch A and Switch B decisions — file has both switches and evidence

## Phase 1 — Fixed-point math and deterministic sim

- [x] P1.01 · `crates/ringside-fixed`: Q32.32 i64 type with checked add/sub/mul/div — unit tests pass
- [x] P1.02 · 1024-entry sigmoid LUT (u32 probs × 2^32) with linear interpolation — test: max abs error vs f64 sigmoid < 1.5e-5 over [-16,16] (interpolation bound h²/8·max|σ″| ≈ 1.18e-5)
- [x] P1.03 · `ln`/`exp` fixed-point approximations with documented error bounds — proptest checks error bound
- [x] P1.04 · Isotonic calibration table (64 knots) evaluation in integer math — unit test vs float reference
- [x] P1.05 · Integer logistic model `predict(features, params)` — test: matches float model to < 1e-4 on random inputs
- [x] P1.06 · `ringside-fixed` is `no_std` — `cargo build --no-default-features --target wasm32-unknown-unknown` succeeds
- [x] P1.07 · proptests for fixed-point (overflow-checked, monotone sigmoid, LUT bounds) — `cargo test -p ringside-fixed` green
- [x] P1.08 · `crates/ringside-sim`: `SimState` with Q16.16 positions, velocities, HP, cooldowns, shield, projectiles[32], powerups[4] — compiles no_std
- [x] P1.09 · Arena 2000×1200, circle colliders, wall clamping — unit test: fighter cannot leave arena
- [x] P1.10 · Movement 9 directions + dash (Space) — unit test: dash displacement and cooldown
- [x] P1.11 · Fire projectiles from pool[32]; hit → −12 HP — unit test: hit reduces HP by 12
- [x] P1.12 · Shield blocks frontal hits for 1.5 s, 6 s cooldown — unit test: frontal hit blocked, rear hit lands
- [x] P1.13 · Power-ups: Medkit +25 HP, Overcharge 2× dmg 5 s, Haste +40% speed 4 s — unit test per power-up
- [x] P1.14 · `spawn_wave(seed, wave_index)` deterministic, every 15 s — test: same seed → same spawn positions
- [x] P1.15 · Match end: HP 0 → loss; 90 s time-out higher HP wins; equal → sudden-death 10 s; then draw — unit tests per outcome
- [x] P1.16 · `step(state, [input_a, input_b]) -> Events` with fixed dt from tick_ms — test: events list hits/pickups/death
- [x] P1.17 · `features(state) -> [i64;16]` (hp_diff, hp_sum, time_left, distance, facing adv, shield_ready a/b, cooldowns, overcharge/haste timers, medkit-distance diff, projectile threat, sudden-death flag) — test: 16 finite values, symmetric under A/B swap where expected
- [x] P1.18 · `canonical_bytes(state)` + `hash_chain` (sha256(prev ‖ tick ‖ bytes)) — test: known-answer vector
- [x] P1.19 · No floats, no HashMap, saturating arithmetic in sim — `grep -E "f32|f64|HashMap" crates/ringside-sim/src` → zero hits
- [x] P1.20 · `crates/ringside-wasm` with `step/replay/hash_chain` via wasm-bindgen — `wasm-pack build` succeeds
- [x] P1.21 · `crates/ringside-py` PyO3 module `ringside_sim.Env` (gymnasium-style reset/step) + fixed-point model eval — `maturin develop` and `python -c "import ringside_sim"`
- [x] P1.22 · Determinism test: 10,000 random-input episodes → identical hash chains native vs WASM (node) vs Python — test script prints 10000/10000 match
- [x] P1.23 · Sim proptests (HP within [0,125], positions in arena, no panic) — `cargo test -p ringside-sim` green

## Phase 2 — Program accounts, delegation, match lifecycle

- [x] P2.01 · Anchor workspace + `programs/ringside` with `#[ephemeral]` before `#[program]` — `anchor build` exit 0
- [x] P2.02 · `Config` account (admin, usdc_mint, fee_bps=100, tick_ms, stale_ticks_max=2, house_vault, spread_params, exposure_cap_per_match, paused) — size ≤ 10,240 test
- [x] P2.03 · `ModelParams` account `["model", version]` (means/scales, weights[16], bias, LUT[1024], calib[64], metrics hash) — size test ~4.5 KB
- [x] P2.04 · `Profile` account `["profile", wallet]` — size test
- [x] P2.05 · `Match` account `["match", match_id]` with SimState, input_buffer, vrf_seed, wave_index, state_hash, last_tick_unix_ms — size ≤ 10,240 test
- [x] P2.06 · `Market` account `["market", match_id]` — size test
- [x] P2.07 · `Position` account `["pos", match_id, wallet]` — size test
- [x] P2.08 · `MatchRecord` account `["record", match_id]` — size test
- [x] P2.09 · All 12 errors defined: ErrStaleTick, ErrFighterBarred, ErrSlippage, ErrExposure, ErrClosed, ErrNotFighter, ErrBadSeq, ErrTooEarly, ErrBadQueue, ErrPaused, ErrMath, ErrAlreadySettled — IDL lists all 12
- [x] P2.10 · `initialize_config` — local test creates Config with expected fields
- [x] P2.11 · `set_model_params(version, chunk)` chunked writes — local test uploads 4.5 KB blob in chunks and reads it back byte-identical
- [x] P2.12 · `create_profile` + `delegate_profile` (TEE validator) — local test: owner == delegation program after delegate
- [x] P2.13 · `create_match(match_id, stake, opponent?)` creates Match + Market + escrow eATA, pre-funds Match PDA, delegates all to TEE — local test
- [x] P2.14 · `join_fight` with `#[session_auth_or]`: stake moves player eATA → escrow, records session signers; second join → Live + VRF request — local ER test
- [x] P2.15 · `submit_input(seq, input_bits)`: fighters only, monotonic seq, 1 per tick — local ER tests incl. ErrNotFighter and ErrBadSeq
- [x] P2.16 · `tick`: time gate (ErrTooEarly), status gate, sim step, hash chain via sha256 syscall — local ER test: tick advances and hash changes; early tick rejected
- [x] P2.17 · `tick` idempotent and permissionless (no signer) — test: any account can call; double-call in same window rejected
- [x] P2.18 · Admin: `pause` (ErrPaused on trade/join), `set_spread_params`, `topup_house_vault`, `withdraw_fees` — local tests
- [x] P2.19 · Program test harness (MagicSVM per the current docs, see decisions.md) — `anchor test` runs `tests/magicsvm`

## Phase 3 — Market and pricing

- [x] P3.01 · Features computed onchain from SimState via ringside-sim — unit test equals native features
- [x] P3.02 · Onchain model: z = Σwx+b, LUT sigmoid, isotonic calibration — test vs Python integer reference
- [x] P3.03 · Features + model < 60k CU — measured CU in local tick logs
- [x] P3.04 · Quotes: spread s = s_base + s_vol·|Δp 10 ticks| + s_time·(1 − t/90); skew k·(inv_a − inv_b)/cap; clamp [0.01, 0.99]; B mirrors A — unit tests
- [x] P3.05 · Tick writes `fair_p`, quotes and `last_priced_tick` in the same instruction (Live market) — local ER test
- [x] P3.06 · Freeze quotes for 2 ticks after a lethal-hit event — unit + local test
- [x] P3.07 · `trade(seen_tick, side, dir, qty, limit_price)` fill vs house at ask/bid, USDC user eATA ↔ house vault eATA — local ER test
- [x] P3.08 · ErrFighterBarred for signer or session authority ∈ fighters/session signers — local ER test
- [x] P3.09 · ErrStaleTick when last_priced_tick − seen_tick > stale_ticks_max — local ER test
- [x] P3.10 · ErrSlippage when price worse than limit — local ER test
- [x] P3.11 · ErrExposure when house liability would exceed cap; per-trade max qty — local ER test
- [x] P3.12 · ErrClosed when market not Live — local ER test
- [x] P3.13 · `TradeEvent {tick, seen_tick, price, qty, side}` emitted — test parses event
- [x] P3.14 · Market counters: volume, n_trades, n_rejected_stale, n_rejected_fighter, fee_accrued — local test (rejections are counted via a separate counting path since failed txs roll back; see decisions)
- [x] P3.15 · `Market.mode = Delayed{delay_ms}` + `relay_delayed_state` signed by relay authority — local test; non-relay signer rejected
- [x] P3.16 · Trade math module shared by program and tests (pure fns) — unit tests
- [x] P3.17 · proptest: Σ USDC conserved across trades — green
- [x] P3.18 · proptest: house liability ≤ cap; price ∈ [0.01, 0.99]; bid < ask — green
- [ ] P3.19 · cargo-fuzz target for trade math — `cargo fuzz run trade -- -runs=100000` with no crash

## Phase 4 — PER positions, settlement, finalize, crank

- [x] P4.01 · `join_position` creates + delegates Position to TEE — local/devnet test
- [ ] P4.02 · Ephemeral permission created on ER for Position with members [owner (TX_LOGS|TX_MESSAGE|TX_BALANCES), program authority], private — devnet test
- [ ] P4.03 · Private read: owner (token) can read Position; non-member cannot — devnet script
- [x] P4.04 · `settle`: pays winner 2×stake − fee from escrow, marks Settled, ErrAlreadySettled on repeat — local ER test
- [x] P4.05 · Draw path: stakes refunded, positions refunded at cost — local ER test
- [ ] P4.06 · Reveal: settle flips Position permissions to public (`UpdateEphemeralPermissionCpi { is_private: false }`), authority kept in member list — devnet read after settle succeeds
- [x] P4.07 · `claim`: pays winning shares 1 USDC each from house vault, idempotent — local ER test
- [ ] P4.08 · `finalize`: MagicIntentBundleBuilder commit [match, market] + post-commit action `write_match_record` — devnet MatchRecord exists on L1
- [x] P4.09 · `write_match_record` L1 handler validates injected escrow signer — test rejects wrong signer
- [ ] P4.10 · Cleanup crank: commit + undelegate Positions in batches — devnet tx
- [x] P4.11 · `schedule_tick(match_id, task_id, interval_ms, iterations)` CPI ScheduleTask with task_id = hash(program_id ‖ match_id), no signer accounts in scheduled ix — local/devnet test cadence
- [ ] P4.12 · Terminal tick schedules settle (crank) — devnet trace shows settle after Closed

## Phase 5 — VRF waves

- [ ] P5.01 · `request_wave_randomness` with `#[vrf]` on the ephemeral queue (or Switch B base-queue seed) — devnet tx
- [ ] P5.02 · `vrf_callback` with `#[vrf_callback]`, writes vrf_seed, wave_index+1, validates queue (ErrBadQueue) — devnet callback tx
- [x] P5.03 · One request per wave (15 s), never per tick — local test counts requests over 90 s
- [x] P5.04 · Tick spawns power-ups from vrf_seed + wave_index; pending VRF handled — test

## Phase 6 — ML

- [x] P6.01 · Scripted bots aggressive / kiting / defensive / random in Rust sim policy + `bots/fighters/scripted.ts` — tests: each runs a full match
- [x] P6.02 · Data gen: ≥ 200,000 simulated matches, mixed pairings, random seeds, every 5th tick → (features, winner) — row counts printed
- [x] P6.03 · Split by match 70/15/15 — test asserts no match id in two splits
- [x] P6.04 · LightGBM teacher trained — val metrics printed
- [x] P6.05 · Logistic student on teacher soft labels + true labels — val metrics printed
- [x] P6.06 · Isotonic calibration on val → 64-knot table — table file written
- [x] P6.07 · Quantize to Q32.32 + run exact onchain integer implementation via PyO3 on held-out — integer predictions file
- [x] P6.08 · Metrics Brier / log-loss / ECE(10) for coin-flip, HP-ratio, LightGBM, logistic float, logistic integer — JSON written
- [x] P6.09 · Reliability diagram PNG — file exists
- [x] P6.10 · Model params blob + metrics hash — blob file + sha256
- [ ] P6.11 · `scripts/upload-model.ts` writes ModelParams on devnet — account readback matches blob
- [x] P6.12 · PyO3 gym env with 10 Hz decisions, obs = 16 features + relative positions, action = 9 moves × fire × dash × shield — env test
- [x] P6.13 · PPO training (`ml/ppo/train.py`) self-play league + scripted opponents — training log + checkpoints
- [ ] P6.14 · Export PPO to ONNX — `onnx.checker` passes; onnxruntime-node inference test
- [x] P6.15 · PPO win rate vs each scripted bot on held-out seeds — JSON

## Phase 7 — Indexer, bots, soak

- [x] P7.01 · Postgres 16 via docker-compose; schema tables matches, ticks, quotes, trades, rejections, hashes, latency — migration applies
- [x] P7.02 · Indexer accountSubscribe Match/Market on TEE RPC with token auth + program logs — inserts rows from devnet
- [x] P7.03 · Indexer measures tick cadence, quote age at fill, submit→confirm latency — rows in `latency`
- [x] P7.04 · Indexer axum REST (matches, match detail, replay inputs, stats) + SSE stream — curl returns JSON
- [x] P7.05 · Indexer verifies MatchRecord on L1 after finalize and retries — log shows check
- [ ] P7.06 · OpenTelemetry spans in bots and indexer — spans exported
- [x] P7.07 · Shared TS client lib (PDAs, IDL, connections, TEE auth with token-only, auto-refresh) — unit test for token URL
- [ ] P7.08 · `bots/fighters/ai.ts` ONNX fighter plays matches 24/7, labeled AI — devnet match played
- [x] P7.09 · `bots/spectators/*.ts` momentum, contrarian, noise, Kelly-sized — devnet trades
- [x] P7.10 · `bots/courtsider.ts` trades both books on lag > spread — devnet fills and rejects
- [x] P7.11 · `bots/delay-relay.ts` posts features to Delayed market after delay_ms (0.5–8 s) — devnet relay txs
- [x] P7.12 · `bots/keeper.ts` time-gated tick fallback — runs against devnet
- [x] P7.13 · Lobby runner keeps matches going 24/7 (create → fight → settle → finalize → repeat) — runs ≥ 3 consecutive matches
- [ ] P7.14 · `bots/soak` Rust tokio swarm K spectators × M trades with latency histograms — run output
- [ ] P7.15 · docker-compose.yml runs postgres + indexer + bots — `docker compose up` healthy

## Phase 8 — Web

- [ ] P8.01 · Next.js 15 App Router + React 19 + TS + Tailwind scaffold in apps/web — `pnpm build` passes
- [ ] P8.02 · Broadcast-style design system (dark, big odds line, motion) — screenshot review
- [ ] P8.03 · Wallet adapter (Phantom/Solflare/Backpack) — connect works in browser
- [ ] P8.04 · Onboarding wizard: session key (gum `createSession`), `delegateSpl`, Profile/Position create + delegate — devnet run
- [ ] P8.05 · TEE auth: `verifyTeeRpcIntegrity` → `getAuthToken` → `?token=` only, auto refresh — unit test + devnet
- [ ] P8.06 · Connections: base RPC, TEE RPC, ConnectionMagicRouter — used by client
- [ ] P8.07 · `/` lobby: live matches, odds, volume, spectators, tick cadence, Fight / Watch / Leaderboard — page renders live data
- [ ] P8.08 · Leaderboard from Profiles — renders
- [ ] P8.09 · Fight flow: stake 1/5/10, queue, challenge-by-link, Fight an AI — devnet match created from UI
- [ ] P8.10 · `/m/[id]` Pixi v8 arena, WASM interpolation at 60 fps, local prediction + reconciliation — renders a live match
- [ ] P8.11 · Fighter controls: WASD/joystick, click/tap fire, Space dash, Shift shield — inputs land onchain
- [ ] P8.12 · Odds chart (uPlot 10 Hz, 30 s history, hit/power-up markers) + bid/ask A/B — renders
- [ ] P8.13 · Trade panel Buy A / Buy B / Sell with amount; shows seen_tick, fill tick, price, latency — devnet trade from UI
- [ ] P8.14 · Private position view + reveal + payout animation + explorer links — devnet
- [ ] P8.15 · QR code for phone spectator flow (qrcode.react) — QR opens /m/<id> on phone
- [ ] P8.16 · Judge mode: dual-book courtsiding panel with live counters (PnL, stale fills accepted, rejections, tx links) from indexer SSE — renders live
- [ ] P8.17 · `/replay/[id]`: WASM re-sim, scrub timeline, odds curve, tx links, Verify ✓ hash chain vs onchain — Verified ✓ on a devnet match
- [ ] P8.18 · `/proof`: A/B chart, calibration plot, latency histograms, privacy test, soak stats from results.json + indexer — renders
- [ ] P8.19 · `/docs`: architecture diagram + how it works — renders
- [ ] P8.20 · Mobile layout for spectator flow — phone viewport screenshot
- [ ] P8.21 · Web typecheck + lint + build green — `pnpm typecheck && pnpm build`

## Phase 9 — Devnet deploy and experiments

- [ ] P9.01 · `scripts/deploy-devnet.sh` deploys program(s) — program ID on explorer
- [ ] P9.02 · `scripts/init-config.ts` — Config account on devnet
- [ ] P9.03 · USDC plan: Circle devnet USDC for users; self-minted test-dollar (6 dec) for house/bots if faucet is short, labeled in UI + README — decision recorded, mint on devnet
- [ ] P9.04 · `scripts/seed-house.ts` funds house vault eATA — balance on TEE
- [ ] P9.05 · `scripts/fund-bots.ts` funds bots SOL + USDC — balances
- [ ] P9.06 · Model uploaded on devnet — ModelParams account link
- [ ] P9.07 · Full live match end to end on devnet: join → VRF wave → ticks → trades → stale-tick reject → fighter-bar reject → settle → reveal → claim → finalize + MatchRecord — tx links in docs/progress.md
- [ ] P9.08 · Bots running 24/7 on a host (lobby, spectators, courtsider, relay) — process status
- [ ] P9.09 · Web deployed to Vercel — URL loads on desktop and phone
- [ ] P9.10 · E1 courtsiding A/B ≥ 50 held-out matches at 0.5/1/2/5/8 s, bootstrap 95% CI — results.json section
- [ ] P9.11 · E2 calibration held-out — results.json section + PNG
- [ ] P9.12 · E3 latency on devnet (tick cadence p50/p95/p99, quote age, submit→confirm) with host region stated — results.json section
- [ ] P9.13 · E4 soak K×M (success rate, rejects by reason, max exposure vs cap, CU per tick/trade) — results.json section
- [ ] P9.14 · E5 privacy leak test (non-member, unauthenticated, opposing fighter → denied; after reveal → readable; plain-ER baseline readable) — results.json section
- [ ] P9.15 · E6 replay determinism K/K WASM + Python vs onchain — results.json section
- [ ] P9.16 · E7 PPO vs scripted held-out — results.json section
- [ ] P9.17 · Negative result + weakest case — results.json section
- [ ] P9.18 · `eval/make_report.py` writes results.json + all charts — one command regenerates

## Phase 10 — Docs, submission, final pass

- [ ] P10.01 · README §1 pitch + headline number + 10 s GIF
- [ ] P10.02 · README §2 live link, video, program IDs, explorer links (VRF callback, stale reject, fighter-bar reject, settlement, commit, MatchRecord)
- [ ] P10.03 · README §3 problem with sources
- [ ] P10.04 · README §4 architecture diagram + why everything is on the TEE validator
- [ ] P10.05 · README §5 MagicBlock usage table with what breaks without each primitive
- [ ] P10.06 · README §6 results E1–E7 + negative result + weakest case, held-out stated
- [ ] P10.07 · README §7 reproduce: one command per experiment
- [ ] P10.08 · README §8 closest projects paragraph
- [ ] P10.09 · README §9 run locally / deploy
- [ ] P10.10 · `/docs` page diagram matches README
- [ ] P10.11 · docs/video.md script + shot list per plan §15
- [ ] P10.12 · docs/submission.md paste-ready text for every form field + X post + builder-directory blurb
- [ ] P10.13 · `scripts/check_consistency.py` verifies every number in README/site/video/submission equals results.json — exit 0
- [ ] P10.14 · CI workflow (fmt, clippy, test, anchor build, wasm, web typecheck+build, Python smoke) — green on GitHub
- [ ] P10.15 · GitHub repo created and pushed (public) — URL
- [ ] P10.16 · Final audit: zero hits for attribution strings and the base repo's original name in tree + git log
- [ ] P10.17 · Secret scan of git history — zero hits
- [ ] P10.18 · Every explorer link in README/submission resolves — link-check script output
