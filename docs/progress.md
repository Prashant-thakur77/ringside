# Progress log (append-only)

## 2026-11-27 00:05 IST · iteration 0
- Repo initialised; first commit contains only `.gitignore`.
- docs/checklist.md generated from RINGSIDE_PLAN.md (all phases 0–10).
- docs/blocked.md, docs/decisions.md created.

## 2026-11-27 00:20 IST · Phase 1 core: ringside-fixed + ringside-sim
- Toolchain: solana-cli 3.1.9, anchor-cli 1.0.2 (built from the official repo tag v1.0.2), rustc 1.89.0 + wasm32 target, Python 3.12 venv.
- `cargo test --release`: ringside-fixed 25 passed, ringside-sim 24 passed (also green on +1.89.0).
- `cargo +1.89.0 build -p ringside-sim --no-default-features --target wasm32-unknown-unknown`: Finished.
- SIM_BYTES = 832 (canonical encoding = storage + hash input). Genesis hash prefix pinned: [149, 76, 87, 85, 16, 164, 199, 107].
```
    test quote::tests::inventory_skews_toward_the_crowded_side ... ok
    test model::tests::roundtrip_bytes ... ok
    test quote::tests::stale_rule ... ok
    test quote::tests::even_match_is_symmetric ... ok
    test model::tests::params_size_is_about_4_5kb ... ok
    test tests::exp_known_values ... ok
    test tests::calibration_identity_table ... ok
    test quote::tests::spread_widens_with_vol_and_time ... ok
    test tests::isqrt_exact ... ok
    test tests::isqrt_prop ... ok
    test quote::tests::quotes_bounded_and_ordered ... ok
    test tests::ln_known_values ... ok
    test tests::mul_div_basics ... ok
    test trade::tests::buy_then_sell_round_trip_costs_the_spread ... ok
    test tests::lut_is_monotone_and_bounded ... ok
    test tests::exp_relative_error ... ok
    test trade::tests::fighter_fee ... ok
    test tests::ln_absolute_error ... ok
    test trade::tests::rejects ... ok
    test tests::mul_never_panics ... ok
    test tests::exp_ln_roundtrip ... ok
    test tests::lut_matches_float_sigmoid ... ok
    test trade::tests::conservation_and_cap ... ok
    test tests::lut_sigmoid_monotone ... ok
    test model::tests::integer_model_matches_float ... ok
    test result: ok. 25 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.03s
    test tests::codec_roundtrip_and_size ... ok
    test tests::equal_hp_sudden_death_then_draw ... ok
    test tests::fighter_cannot_leave_arena ... ok
    test tests::features_are_finite_and_antisymmetric ... ok
    test tests::haste_is_40_percent_faster ... ok
    test tests::aim_at_cardinals ... ok
    test tests::medkit_heals_25_capped ... ok
    test tests::ko_ends_match ... ok
    test tests::dash_displacement_and_cooldown ... ok
    test tests::overcharge_doubles_damage ... ok
    test tests::shield_blocks_frontal_not_rear ... ok
    test tests::hit_costs_12_hp ... ok
    test tests::no_floats_or_hashmaps_in_sim ... ok
    test tests::hash_chain_known_answer ... ok
    test tests::walking_speed ... ok
    test tests::input_roundtrip ... ok
    test tests::shield_duration_and_cooldown ... ok
    test tests::waves_every_15s_from_seed ... ok
    test tests::timeout_higher_hp_wins ... ok
    test tests::sudden_death_first_hit_wins ... ok
    test tests::every_policy_finishes_matches ... ok
    test tests::policies_differ_in_strength ... ok
    test tests::invariants_hold_under_random_inputs ... ok
    test tests::same_inputs_same_hash ... ok
    test result: ok. 24 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
    test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
    test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

## 2026-11-27 00:35 IST · Phase 1 complete: WASM + Python bindings, cross-target determinism
- Combat tuning (plan-fixed values untouched: 100 HP, −12/hit, shield 1.5 s/6 s, power-ups): fire cd 700 ms, projectile 620 u/s, move 360 u/s, radius 28; bot aim noise and lead scale with skill. Bot-vs-bot matches now last 19–90 s with timeouts and sudden death; no policy dominates (aggressive beats kiting 92%, defensive beats aggressive 98%, kiting beats defensive 70%).
- `scripts/build-wasm.sh`: wasm ok, 128K (wasm-bindgen 0.2.130, web + nodejs targets).
- `maturin develop --release`: Installed ringside-sim-0.1.0 (VecEnv, generate_dataset, predict_int, params_to_bytes, replay, run_matches). Data gen speed: 2000 matches in 0.03 s.
- Bug found and fixed: episode generator cast u64→usize before `%`, which truncates on wasm32 (4/10000 matched). Now modulo happens in u64.
- `tests/determinism/run.sh` (10,000 episodes):
```
python vs native: 10000/10000 episodes identical
python host episodes: 200 written
wasm vs native: 10000/10000 episodes identical
wasm vs python replay: 200/200 episodes, 124761 chain links compared
determinism: native = python = wasm for 10000 episodes
```

## 2026-11-27 00:55 IST · Phase 6 (part): win-probability model + PPO trainer
- `ml/winprob/gen_data.py`: generated 200000 matches, 19218024 rows (every 5th tick) in 10.4 s.
- Split by match id (`match_id % 20`): 70/15/15; `tests/python/test_ml.py` 5 passed (split disjoint by match, dataset shape, VecEnv contract, held-out seed parity, integer model).
- `ml/winprob/train.py` (held-out = 30k unseen matches, 2,859,074 rows):
```
coin_flip                    brier 0.2500  logloss 0.6931  ece 0.0003
hp_ratio                     brier 0.1925  logloss 0.5653  ece 0.1007
lightgbm_float               brier 0.1639  logloss 0.4876  ece 0.0073
logistic_float               brier 0.1735  logloss 0.5127  ece 0.0038
logistic_onchain_integer     brier 0.1736  logloss 0.5127  ece 0.0034
onchain-vs-float gap mean 0.0031, p99 0.0135, max 0.0183 (64-knot table vs float isotonic)
metrics_hash 58114e353b24813fb6c3e928c10c8a818d24ae68e7e955e2e09bb0293c3461ad
```
- Program: added `predict_bytes` (reads the 4,744-byte blob in place; proptest proves it bit-identical to `ModelParams::predict`) because a decoded `ModelParams` would overflow the 4 KB BPF stack frame.
- PPO: `ml/ppo/train.py` smoke run reached 27k env steps/s; a 60-minute league run is in progress.

## 2026-11-27 01:45 IST · Program builds; MagicSVM suite green (Phases 2–5 on the in-process ER)
- `anchor build --ignore-keys`: ringside.so 831,784 bytes (opt-level "s"), IDL with all 12 plan errors (6000 ErrStaleTick … 6011 ErrAlreadySettled) plus ErrFrozen and helpers.
- Toolchain fixes: anchor macro crates pinned to 1.1.2 (1.2.2 pulls `create_account_allow_prefund` that anchor-lang 1.0.2 lacks); `hashv` from `solana-sha256-hasher`; host-only helpers gated behind `std` to keep BPF frames < 4 KB.
- Bugs found by the suite and fixed: VRF callback args are raw bytes (`wave: u16`, not `Vec<u8>`); `#[vrf_callback]` identity derived at runtime used 197k CU → bound to compile-time const (decisions.md); wave index read from the wrong sim offset (16 → 14, now pinned by `codec_offsets_used_by_the_program`).
- `cd tests/magicsvm && cargo +stable test --release -- --nocapture`:
```
test spoofed_vrf_callback_is_rejected ... ok
test admin_paths_and_pause ... ok
test crank_schedules_ticks_with_derived_task_id ... ok
CU {"tick_cu_p50":35897,"tick_cu_p99":39851,"tick_cu_max":40828,"trade_cu":19896,"ticks_measured":183}
test full_match_lifecycle ... ok
test draw_refunds_both_stakes ... ok
test result: ok. 5 passed; 0 failed
```
- `full_match_lifecycle` asserts: config/model upload (blob byte-identical), house vault eATA + top-up, profiles delegated, match+books+escrow delegated (base owner = DLP), joins (stake → escrow, double join rejected), genesis hash via sha256 syscall == sha2 crate, VRF wave via ephemeral queue callback, input rules (ErrNotFighter, ErrBadSeq ×2), time gate (ErrTooEarly in one slot; wall-clock bound stops bursts), every tick's onchain state_hash == off-chain replay with the shared sim, book priced in the same instruction (last_priced_tick == tick), freeze after lethal-range hit (ErrFrozen), buy/sell fills with exact USDC movement, ErrStaleTick strict + recorded counter, ErrFighterBarred, ErrSlippage, ErrExposure (max exposure ≤ cap), private Position (unauthenticated and opposing fighter denied, owner allowed, market public), relay auth (ErrUnauthorized) and delayed-book fill on a 50-tick-old price while the live book rejects it, ErrClosed after the bell, post-end tick no-op, settle (winner 2×stake − 1%, fee accrued, idempotent), reveal (position public), claim exact + idempotent, finalize → MatchRecord written on base by the Magic Action with the final hash, withdraw_fees, cleanup_positions (position undelegated), direct write_match_record rejected (6015).
- Note: devnet-tee behaviour (TEE privacy, real VRF oracle, crank cadence) is still to be proven live; the corresponding items stay unticked.

## 2026-11-27 03:05 IST · TS client, setup scripts, local stack, match runner, PPO done
- Local stack (`scripts/setup-local.sh`): base validator with MagicBlock program dumps + Ringside (upgradeable), ER 1.1.1 in Docker. Setup output:
```
[local] config initialized Gn2PTrRkfkFpvy3oU7FNMwSsPvaQ9fg61SoKeKMR4UqK
[local] model readback matches blob ATTNMp41xs7zeUxSdFMD3iBBhMp2QM8KMWxhoebZuEaF metrics hash 58114e35…
[local] house vault on ER: … balance 500000000
[local] fighter-a / fighter-b / spec-1..4 / courtsider funded via eSPL delegateSpl
```
- `bots/run-match.ts` on the local ER: create + delegate → joins → VRF request → `schedule_tick` crank (ticks advanced by the ER scheduler; keeper fallback not needed locally) → inputs from brains → crank-run settle → finalize. Runs: scripted aggressive vs random, winner A at tick 290; PPO (ONNX) vs defensive, winner A at tick 116; PPO vs kiting, winner A at tick 96.
- PPO (`ml/ppo/out/eval.json`, 141,459,456 steps, 60 min): held-out (odd seeds) greedy win rate vs aggressive 1.0, kiting 1.0, defensive 0.9967, random 1.0 (300 episodes each).
- Bugs fixed on the way: house/escrow canonical ATAs must exist on base for the ER projection; finalize commit split (decisions.md).

## 2026-11-27 03:20 IST · Bot fleet on the local ER
- `bots/lobby.ts --matches 3 --delays 5000,500,2000` (local stack): relay + 4 spectators + courtsider running against back-to-back AI matches:
```
courtsider …083978: delayed pnl -3.59 (11 fills, 11 stale accepted) · ringside pnl -1.82 (11 stale rejected, 10 fresh fills)
[lobby] match …083978 (AI · PPO vs AI · PPO, delay 5000 ms): winner 2 at tick 121, crank
courtsider …132836: delayed pnl 1.26 (10 fills, 10 stale accepted) · ringside pnl -0.18 (11 stale rejected, 11 fresh fills)
[lobby] match …132836 (AI · PPO vs Scripted · kiting, delay 500 ms): winner 1 at tick 89, crank
courtsider …173049: delayed pnl 13.56 (13 fills, 13 stale accepted) · ringside pnl 1.51 (13 stale rejected, 12 fresh fills)
[lobby] match …173049 (AI · PPO vs Scripted · defensive, delay 2000 ms): winner 1 at tick 96, crank
```
- Scripted fighters (P6.01) run from the Rust policies through WASM (`bots/lib/brains.ts`), identical to training opponents.

## 2026-11-27 03:45 IST · Indexer (Rust) on the local ER
- `services/indexer` (tokio + axum + sqlx/Postgres 16 + tungstenite logs subscription, TEE token auth): `cargo +stable test` 2 passed.
- After a lobby match (delay 2000 ms): `/matches/<id>/replay` → 121 ticks, complete chain; `/judge/<id>`:
```
ringside {'fills': 66, 'stale_fills_accepted': 0, 'stale_rejections': 16, 'reject_sig': '4TKZwAvj…'}
tv_delay {'fills': 20, 'stale_fills_accepted': 20, 'stale_rejections': 0}
```
- `/stats` reports tick cadence p50/p95/p99, quote age at fill, submit→confirm by kind (from bot OTel spans), counts.
- MatchRecord check + finalize retry: the indexer builds and signs the finalize + commit_match transaction itself; the ER accepted it (sig 5LdXt9W4…). Locally the record cannot land (v1 settlement tx, see decisions); live check on devnet.
- Program: TradeEvent now carries `game_tick` so staleness on the TV-delay book is measured against the fight's real tick.
