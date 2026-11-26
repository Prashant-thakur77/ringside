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
