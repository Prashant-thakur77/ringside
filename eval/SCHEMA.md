# eval/results/results.json schema

Written only by `eval/make_report.py`. README, the /proof page, docs/video.md and docs/submission.md
read their numbers from here; `scripts/check_consistency.py` enforces it.

```
generated_at, network, host_region, er_endpoint, program_id
headline: { delay_ms, courtsider_pnl_per_match_tv, courtsider_pnl_per_match_ringside, stale_fills_accepted_tv, stale_fills_accepted_ringside, stale_rejections_ringside, n_matches }
e1: { heldout: true, n_matches, delays: [{ delay_ms, n_matches, pnl_mean, pnl_ci95: [lo, hi], fills, stale_fills_accepted, house_pnl_mean }],
      ringside: { n_matches, pnl_mean, pnl_ci95, stale_attempts, stale_rejections, stale_fills_accepted, fresh_fills, house_pnl_mean } }
e2: { heldout: true, n_test_matches, n_test_rows, models: { name: { brier, log_loss, ece } }, onchain_vs_float_gap: { mean, p99, max }, buckets }
e3: { tick_cadence_ms: { p50, p95, p99, n }, quote_age_at_fill_ms: { p50, p95, n }, submit_confirm_ms: { kind: { p50, p95, n } }, sourced_stream_delay_s: [5, 8] }
e4: { bots, trades_attempted, success_rate, rejects_by_reason, max_exposure_usdc, cap_usdc, cu: { tick_p50, tick_max, trade } }
e5: { attempts: { non_member, unauthenticated, opposing_fighter }, denied: {...}, after_reveal_readable, plain_er_readable }
e6: { k, verified_wasm, verified_python }
e7: { heldout: true, episodes_per_bot, win_rate: { aggressive, kiting, defensive, random } }
negative: [ { title, detail, value } ]
weakest_case: { title, detail }
```
