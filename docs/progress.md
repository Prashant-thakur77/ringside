# Progress log (append-only)

## 2026-11-27 00:05 IST · iteration 0
- Repo initialised; first commit contains only `.gitignore`.
- docs/checklist.md generated from RINGSIDE_PLAN.md (all phases 0–10).
- docs/blocked.md, docs/decisions.md created.

## 2026-11-27 01:00 IST · Phase 1 core: ringside-fixed + ringside-sim
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

## 2026-11-27 01:40 IST · Phase 1 complete: WASM + Python bindings, cross-target determinism
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

## 2026-11-27 02:45 IST · Phase 6 (part): win-probability model + PPO trainer
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
