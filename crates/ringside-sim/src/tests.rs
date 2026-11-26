use super::*;
use crate::bots::{run_match, Bot, Policy};
use proptest::prelude::*;

fn inp(mv: u8, fire: bool, dash: bool, shield: bool, aim: u8) -> u16 {
    Input { mv, fire, dash, shield, aim }.encode()
}

fn units(v: i32) -> i64 {
    v as i64 / FP
}

#[test]
fn input_roundtrip() {
    for bits in 0u16..=0x0fff {
        let i = Input::decode(bits);
        assert_eq!(Input::decode(i.encode()), i);
    }
}

#[test]
fn aim_at_cardinals() {
    assert_eq!(aim_at(1, 0), 0);
    assert_eq!(aim_at(0, 1), 4);
    assert_eq!(aim_at(-1, 0), 8);
    assert_eq!(aim_at(0, -1), 12);
    assert_eq!(aim_at(1, 1), 2);
    assert_eq!(move_code_from_dir16(0), 1);
    assert_eq!(move_code_from_dir16(4), 3);
    assert_eq!(move_code_from_dir16(15), 1);
}

#[test]
fn fighter_cannot_leave_arena() {
    let mut s = SimState::new(100, [0; 32]);
    for _ in 0..400 {
        step(&mut s, [inp(5, false, true, false, 0), inp(1, false, true, false, 0)]); // A west, B east
    }
    assert_eq!(units(s.fighters[0].x), FIGHTER_R);
    assert_eq!(units(s.fighters[1].x), ARENA_W - FIGHTER_R);
    let mut s = SimState::new(100, [0; 32]);
    for _ in 0..400 {
        step(&mut s, [inp(3, false, false, false, 0), inp(7, false, false, false, 0)]);
    }
    assert_eq!(units(s.fighters[0].y), ARENA_H - FIGHTER_R);
    assert_eq!(units(s.fighters[1].y), FIGHTER_R);
}

#[test]
fn walking_speed() {
    let mut s = SimState::new(100, [0; 32]);
    step(&mut s, [inp(1, false, false, false, 0), 0]);
    assert_eq!(units(s.fighters[0].x), 400 + SPEED / 10);
}

#[test]
fn dash_displacement_and_cooldown() {
    let mut s = SimState::new(100, [0; 32]);
    let ev = step(&mut s, [inp(3, false, true, false, 0), 0]);
    assert!(ev.has(EV_DASH_A));
    step(&mut s, [inp(3, false, true, false, 0), 0]);
    // two ticks of dash at 1400 u/s = 280 units
    assert_eq!(units(s.fighters[0].y), 600 + 280);
    // dash is on cooldown: the third tick walks
    let ev = step(&mut s, [inp(3, false, true, false, 0), 0]);
    assert!(!ev.has(EV_DASH_A));
    assert_eq!(units(s.fighters[0].y), 600 + 280 + SPEED / 10);
    assert!(s.fighters[0].dash_cd > 0);
}

fn run_until_hit(s: &mut SimState, ia: u16, ib: u16) -> Events {
    for _ in 0..40 {
        let ev = step(s, [ia, ib]);
        if ev.flags & (EV_HIT_A | EV_HIT_B | EV_BLOCK_A | EV_BLOCK_B) != 0 {
            return ev;
        }
    }
    panic!("no hit");
}

#[test]
fn hit_costs_12_hp() {
    let mut s = SimState::new(100, [0; 32]);
    let ev = run_until_hit(&mut s, inp(0, true, false, false, 0), inp(0, false, false, false, 8));
    assert!(ev.has(EV_HIT_B));
    assert_eq!(s.fighters[1].hp, MAX_HP - 12);
    assert_eq!(ev.damage[1], 12);
}

#[test]
fn shield_blocks_frontal_not_rear() {
    // B faces A (aim 8 = west) with shield: blocked. B stands close so the shot lands inside 1.5 s.
    let mut s = SimState::new(100, [0; 32]);
    s.fighters[1].x = (800 * FP) as i32;
    let ev = run_until_hit(&mut s, inp(0, true, false, false, 0), inp(0, false, false, true, 8));
    assert!(ev.has(EV_BLOCK_B));
    assert_eq!(s.fighters[1].hp, MAX_HP);
    assert!(s.fighters[1].shield_cd > SHIELD_MS);
    // B faces away (aim 0 = east) with shield: hit lands in the back.
    let mut s = SimState::new(100, [0; 32]);
    s.fighters[1].x = (800 * FP) as i32;
    let ev = run_until_hit(&mut s, inp(0, true, false, false, 0), inp(0, false, false, true, 0));
    assert!(ev.has(EV_HIT_B));
    assert_eq!(s.fighters[1].hp, MAX_HP - 12);
}

#[test]
fn shield_duration_and_cooldown() {
    let mut s = SimState::new(100, [0; 32]);
    step(&mut s, [inp(0, false, false, true, 0), 0]);
    assert_eq!(s.fighters[0].shield_ms, SHIELD_MS);
    for _ in 0..15 {
        step(&mut s, [0, 0]);
    }
    assert_eq!(s.fighters[0].shield_ms, 0);
    let ev = step(&mut s, [inp(0, false, false, true, 0), 0]);
    assert!(!ev.has(EV_SHIELD_A), "still on cooldown");
    for _ in 0..50 {
        step(&mut s, [0, 0]);
    }
    let ev = step(&mut s, [inp(0, false, false, true, 0), 0]);
    assert!(ev.has(EV_SHIELD_A));
}

fn place_powerup(s: &mut SimState, kind: u8) {
    s.powerups[0] = Powerup { kind, x: s.fighters[0].x, y: s.fighters[0].y };
}

#[test]
fn medkit_heals_25_capped() {
    let mut s = SimState::new(100, [0; 32]);
    s.fighters[0].hp = 50;
    place_powerup(&mut s, PU_MEDKIT);
    let ev = step(&mut s, [0, 0]);
    assert!(ev.has(EV_PICKUP_A));
    assert_eq!(s.fighters[0].hp, 75);
    s.fighters[0].hp = 90;
    place_powerup(&mut s, PU_MEDKIT);
    step(&mut s, [0, 0]);
    assert_eq!(s.fighters[0].hp, MAX_HP);
}

#[test]
fn overcharge_doubles_damage() {
    let mut s = SimState::new(100, [0; 32]);
    place_powerup(&mut s, PU_OVERCHARGE);
    step(&mut s, [0, 0]);
    assert_eq!(s.fighters[0].overcharge_ms, OVERCHARGE_MS);
    run_until_hit(&mut s, inp(0, true, false, false, 0), inp(0, false, false, false, 8));
    assert_eq!(s.fighters[1].hp, MAX_HP - 24);
}

#[test]
fn haste_is_40_percent_faster() {
    let mut s = SimState::new(100, [0; 32]);
    place_powerup(&mut s, PU_HASTE);
    step(&mut s, [0, 0]);
    let x0 = units(s.fighters[0].x);
    step(&mut s, [inp(1, false, false, false, 0), 0]);
    assert_eq!(units(s.fighters[0].x) - x0, SPEED * 14 / 100);
    assert_eq!(s.fighters[0].haste_ms, HASTE_MS - 100);
}

#[test]
fn waves_every_15s_from_seed() {
    let seed = [7u8; 32];
    let mut s = SimState::new(100, seed);
    let mut waves = 0;
    for _ in 0..450 {
        let ev = step(&mut s, [0, 0]);
        if ev.has(EV_WAVE) {
            waves += 1;
            assert_eq!(s.time_ms % WAVE_MS, 0);
        }
    }
    assert_eq!(waves, 3);
    assert_eq!(spawn_wave(&seed, 2), spawn_wave(&seed, 2));
    assert_ne!(spawn_wave(&seed, 2), spawn_wave(&seed, 3));
    assert_ne!(spawn_wave(&seed, 2), spawn_wave(&[8u8; 32], 2));
    let w = spawn_wave(&seed, 0);
    let n = w.iter().filter(|p| p.kind != 0).count();
    assert!((2..=4).contains(&n));
    for p in w.iter().filter(|p| p.kind != 0) {
        assert!((200..1800).contains(&units(p.x)) && (150..1050).contains(&units(p.y)));
    }
}

#[test]
fn ko_ends_match() {
    let mut s = SimState::new(100, [0; 32]);
    s.fighters[1].hp = 12;
    let ev = run_until_hit(&mut s, inp(0, true, false, false, 0), inp(0, false, false, false, 8));
    assert!(ev.has(EV_END) && ev.has(EV_LETHAL));
    assert_eq!(s.winner, WINNER_A);
    assert!(s.is_over());
    let before = s.clone();
    assert_eq!(step(&mut s, [0, 0]), Events::default());
    assert_eq!(s, before);
}

#[test]
fn timeout_higher_hp_wins() {
    let mut s = SimState::new(100, [0; 32]);
    s.fighters[0].hp = 40;
    s.fighters[1].hp = 39;
    s.next_wave_ms = u32::MAX;
    for _ in 0..900 {
        step(&mut s, [0, 0]);
    }
    assert!(s.is_over());
    assert_eq!(s.winner, WINNER_A);
    assert_eq!(s.time_ms, MATCH_MS);
}

#[test]
fn equal_hp_sudden_death_then_draw() {
    let mut s = SimState::new(100, [0; 32]);
    s.next_wave_ms = u32::MAX;
    for _ in 0..900 {
        step(&mut s, [0, 0]);
    }
    assert_eq!(s.phase, PHASE_SUDDEN_DEATH);
    for _ in 0..99 {
        step(&mut s, [0, 0]);
    }
    assert_eq!(s.phase, PHASE_SUDDEN_DEATH);
    let ev = step(&mut s, [0, 0]);
    assert!(ev.has(EV_END));
    assert_eq!(s.winner, WINNER_DRAW);
}

#[test]
fn sudden_death_first_hit_wins() {
    let mut s = SimState::new(100, [0; 32]);
    s.next_wave_ms = u32::MAX;
    for _ in 0..900 {
        step(&mut s, [0, 0]);
    }
    assert_eq!(s.phase, PHASE_SUDDEN_DEATH);
    let f = features(&s);
    assert_eq!(f[13], ringside_fixed::ONE);
    run_until_hit(&mut s, inp(0, false, false, false, 0), inp(0, true, false, false, 8));
    assert_eq!(s.winner, WINNER_B);
}

#[test]
fn codec_roundtrip_and_size() {
    let mut s = SimState::new(100, [3; 32]);
    for t in 0..120 {
        step(&mut s, [inp((t % 9) as u8, t % 3 == 0, t % 17 == 0, t % 23 == 0, (t % 16) as u8), inp(1, true, false, false, 8)]);
    }
    let b = encode(&s);
    assert_eq!(b.len(), SIM_BYTES);
    assert_eq!(decode(&b).unwrap(), s);
    assert!(decode(&b[1..]).is_none());
    assert!(SIM_BYTES < 1024);
}

#[test]
fn hash_chain_known_answer() {
    let s = SimState::new(100, [0; 32]);
    let g = genesis_hash(&s);
    // Recomputing gives the same value and a one-bit change in the state changes it.
    assert_eq!(g, genesis_hash(&s.clone()));
    let mut s2 = s.clone();
    s2.fighters[0].hp -= 1;
    assert_ne!(g, genesis_hash(&s2));
    // Pinned vector: any change to the encoding or the initial state must update this on purpose.
    assert_eq!(hex8(&g), GENESIS_PREFIX);
}

fn hex8(h: &[u8; 32]) -> [u8; 8] {
    let mut o = [0u8; 8];
    o.copy_from_slice(&h[..8]);
    o
}

/// First 8 bytes of the genesis hash of `SimState::new(100, [0; 32])`.
const GENESIS_PREFIX: [u8; 8] = include!("genesis_prefix.in");

#[test]
fn features_are_finite_and_antisymmetric() {
    let mut s = SimState::new(100, [5; 32]);
    let mut a = Bot::new(Policy::Aggressive, 900, 1);
    let mut b = Bot::new(Policy::Kiting, 900, 2);
    for _ in 0..200 {
        let ia = a.act(&s, 0);
        let ib = b.act(&s, 1);
        step(&mut s, [ia, ib]);
        if s.is_over() {
            break;
        }
        let f = features(&s);
        let mut sw = s.clone();
        sw.fighters.swap(0, 1);
        for p in sw.projectiles.iter_mut() {
            p.owner = 1 - p.owner;
        }
        let g = features(&sw);
        for i in [0usize, 4, 7, 8, 9, 10, 11, 12, 14, 15] {
            assert_eq!(f[i], -g[i], "feature {} {}", i, FEATURE_NAMES[i]);
        }
        assert_eq!(f[5], g[6]);
        for i in [1usize, 2, 3, 13] {
            assert_eq!(f[i], g[i]);
        }
        for v in f {
            assert!(v.abs() <= 4 * ringside_fixed::ONE);
        }
    }
}

#[test]
fn no_floats_or_hashmaps_in_sim() {
    for (name, src) in [
        ("lib.rs", include_str!("lib.rs")),
        ("bots.rs", include_str!("bots.rs")),
        ("codec.rs", include_str!("codec.rs")),
        ("features.rs", include_str!("features.rs")),
    ] {
        for bad in ["f32", "f64", "HashMap", "HashSet"] {
            assert!(!src.contains(bad), "{name} contains {bad}");
        }
    }
}

#[test]
fn every_policy_finishes_matches() {
    for (i, pa) in Policy::ALL.iter().enumerate() {
        for (j, pb) in Policy::ALL.iter().enumerate() {
            let r = run_match(&mut Bot::new(*pa, 850, i as u64), &mut Bot::new(*pb, 850, 100 + j as u64), 42 + (i * 4 + j) as u64, 100);
            assert!(r.winner != WINNER_NONE);
            assert!(r.ticks <= 1000);
        }
    }
}

#[test]
fn policies_differ_in_strength() {
    let mut wins = 0;
    let n = 60;
    for m in 0..n {
        let r = run_match(&mut Bot::new(Policy::Aggressive, 900, m), &mut Bot::new(Policy::Random, 900, 1000 + m), m, 100);
        if r.winner == WINNER_A {
            wins += 1;
        }
    }
    assert!(wins > n / 2, "aggressive should beat random, won {wins}/{n}");
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]
    #[test]
    fn invariants_hold_under_random_inputs(inputs in proptest::collection::vec((any::<u16>(), any::<u16>()), 1..1100), seed in any::<[u8; 32]>()) {
        let mut s = SimState::new(100, seed);
        for (a, b) in inputs {
            step(&mut s, [a, b]);
            for f in s.fighters {
                prop_assert!(f.hp <= MAX_HP);
                prop_assert!(f.hp > -(2 * HIT_DMG as i16) * N_PROJ as i16);
                prop_assert!((FIGHTER_R..=ARENA_W - FIGHTER_R).contains(&units(f.x)));
                prop_assert!((FIGHTER_R..=ARENA_H - FIGHTER_R).contains(&units(f.y)));
            }
            prop_assert_eq!(decode(&encode(&s)).unwrap(), s.clone());
        }
    }

    #[test]
    fn same_inputs_same_hash(inputs in proptest::collection::vec((any::<u16>(), any::<u16>()), 1..300)) {
        let run = || {
            let mut s = SimState::new(100, [9; 32]);
            let mut h = genesis_hash(&s);
            for (a, b) in &inputs {
                step(&mut s, [*a, *b]);
                h = hash_link(&h, s.tick as u64, &encode(&s));
            }
            h
        };
        prop_assert_eq!(run(), run());
    }
}

#[test]
fn codec_offsets_used_by_the_program() {
    let mut s = SimState::new(100, [0; 32]);
    s.wave_index = 0xBEEF;
    s.vrf_seed = [0xAB; 32];
    s.tick = 0x01020304;
    let b = encode(&s);
    assert_eq!(u32::from_le_bytes(b[0..4].try_into().unwrap()), 0x01020304);
    assert_eq!(u16::from_le_bytes(b[14..16].try_into().unwrap()), 0xBEEF, "wave_index at 14");
    assert_eq!(&b[20..52], &[0xAB; 32], "vrf_seed at 20");
}
