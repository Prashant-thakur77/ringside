//! The 16 pricing features, Q32.32, computed from the sim state.
//!
//! Antisymmetric features flip sign when A and B are swapped; the model then gives
//! P(A wins | swapped) ≈ 1 − P(A wins).

use crate::{
    dir16, SimState, ARENA_H, ARENA_W, DASH_CD_MS, FIRE_CD_MS, FP, HASTE_MS, MATCH_MS, N_POWERUP,
    N_PROJ, OVERCHARGE_MS, PHASE_SUDDEN_DEATH, PU_MEDKIT,
};
use ringside_fixed::{from_ratio, isqrt_u64, ONE};

pub const N_FEATURES: usize = 16;
/// Feature names, in order. Shared with the ML pipeline.
pub const FEATURE_NAMES: [&str; N_FEATURES] = [
    "hp_diff",
    "hp_sum",
    "time_left",
    "distance",
    "facing_adv",
    "shield_ready_a",
    "shield_ready_b",
    "fire_cd_adv",
    "dash_cd_adv",
    "overcharge_adv",
    "haste_adv",
    "medkit_dist_adv",
    "threat_adv",
    "sudden_death",
    "hp_diff_x_elapsed",
    "shield_active_adv",
];

const THREAT_RANGE: i64 = 500;

fn units(v: i32) -> i64 {
    v as i64 / FP
}

fn diag() -> i64 {
    isqrt_u64((ARENA_W * ARENA_W + ARENA_H * ARENA_H) as u64) as i64
}

fn dist_units(ax: i32, ay: i32, bx: i32, by: i32) -> i64 {
    let dx = units(ax) - units(bx);
    let dy = units(ay) - units(by);
    isqrt_u64((dx * dx + dy * dy) as u64) as i64
}

fn r(n: i64, d: i64) -> i64 {
    from_ratio(n, d).unwrap_or(0)
}

/// Cosine between fighter i's aim and the direction to the other fighter, Q32.32.
fn facing(s: &SimState, i: usize) -> i64 {
    let me = s.fighters[i];
    let op = s.fighters[1 - i];
    let dx = units(op.x) - units(me.x);
    let dy = units(op.y) - units(me.y);
    let d = isqrt_u64((dx * dx + dy * dy) as u64) as i64;
    if d == 0 {
        return 0;
    }
    let (ax, ay) = dir16(me.aim);
    r(ax * dx + ay * dy, FP * d)
}

fn nearest_medkit(s: &SimState, i: usize) -> Option<i64> {
    let f = s.fighters[i];
    let mut best: Option<i64> = None;
    for k in 0..N_POWERUP {
        let p = s.powerups[k];
        if p.kind == PU_MEDKIT {
            let d = dist_units(f.x, f.y, p.x, p.y);
            best = Some(best.map_or(d, |b| b.min(d)));
        }
    }
    best
}

/// Threat on fighter i: Σ over approaching enemy projectiles within range of (range − d)/range.
fn threat(s: &SimState, i: usize) -> i64 {
    let f = s.fighters[i];
    let mut t = 0i64;
    for k in 0..N_PROJ {
        let p = s.projectiles[k];
        if p.active == 0 || p.owner as usize == i {
            continue;
        }
        let dx = units(f.x) - units(p.x);
        let dy = units(f.y) - units(p.y);
        let approaching = (p.vx as i64 * dx + p.vy as i64 * dy) > 0;
        if !approaching {
            continue;
        }
        let d = isqrt_u64((dx * dx + dy * dy) as u64) as i64;
        if d < THREAT_RANGE {
            t += r(THREAT_RANGE - d, THREAT_RANGE);
        }
    }
    t
}

/// Computes the 16 features (Q32.32).
pub fn features(s: &SimState) -> [i64; N_FEATURES] {
    let a = s.fighters[0];
    let b = s.fighters[1];
    let hp_a = a.hp.max(0) as i64;
    let hp_b = b.hp.max(0) as i64;
    let tl = s.time_left_ms() as i64;
    let time_left = r(tl, MATCH_MS as i64);
    let hp_diff = r(hp_a - hp_b, 100);
    let dg = diag();
    let medkit = match (nearest_medkit(s, 0), nearest_medkit(s, 1)) {
        (Some(da), Some(db)) => r(db - da, dg),
        _ => 0,
    };
    let b2i = |v: bool| if v { ONE } else { 0 };
    [
        hp_diff,
        r(hp_a + hp_b, 200),
        time_left,
        r(dist_units(a.x, a.y, b.x, b.y), dg),
        facing(s, 0) - facing(s, 1),
        b2i(a.shield_cd == 0),
        b2i(b.shield_cd == 0),
        r(b.fire_cd as i64 - a.fire_cd as i64, FIRE_CD_MS as i64),
        r(b.dash_cd as i64 - a.dash_cd as i64, DASH_CD_MS as i64),
        r(a.overcharge_ms as i64 - b.overcharge_ms as i64, OVERCHARGE_MS as i64),
        r(a.haste_ms as i64 - b.haste_ms as i64, HASTE_MS as i64),
        medkit,
        threat(s, 1) - threat(s, 0),
        b2i(s.phase == PHASE_SUDDEN_DEATH),
        // (hp_a − hp_b)/100 × elapsed/90 s as one truncating ratio, so it is exactly antisymmetric.
        r((hp_a - hp_b) * (MATCH_MS as i64 - tl), 100 * MATCH_MS as i64),
        b2i(a.shield_ms > 0) - b2i(b.shield_ms > 0),
    ]
}
