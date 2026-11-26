//! Deterministic 1v1 duel simulation.
//!
//! Integer-only (Q16.16 positions in i32), fixed iteration order, no allocation and no floats, so
//! the onchain program, the browser (WASM) and Python produce identical states and hash chains.
#![cfg_attr(not(feature = "std"), no_std)]

pub mod bots;
mod codec;
mod features;

pub use codec::{decode, encode, encode_into as encode_into_slice, SIM_BYTES};
pub use features::{features, FEATURE_NAMES, N_FEATURES};

/// Q16.16 scale.
pub const FP: i64 = 1 << 16;

pub const ARENA_W: i64 = 2000;
pub const ARENA_H: i64 = 1200;
pub const FIGHTER_R: i64 = 28;
pub const PROJ_R: i64 = 8;
pub const POWERUP_R: i64 = 22;

pub const MAX_HP: i16 = 100;
pub const HIT_DMG: u8 = 12;
pub const SPEED: i64 = 360;
pub const HASTE_PCT: i64 = 140;
pub const DASH_SPEED: i64 = 1400;
pub const DASH_MS: u16 = 200;
pub const DASH_CD_MS: u16 = 2000;
pub const FIRE_CD_MS: u16 = 700;
pub const PROJ_SPEED: i64 = 620;
pub const PROJ_TTL_MS: u16 = 2000;
pub const SHIELD_MS: u16 = 1500;
pub const SHIELD_CD_MS: u16 = 6000;
pub const MEDKIT_HP: i16 = 25;
pub const OVERCHARGE_MS: u16 = 5000;
pub const HASTE_MS: u16 = 4000;
pub const MATCH_MS: u32 = 90_000;
pub const SUDDEN_DEATH_MS: u16 = 10_000;
pub const WAVE_MS: u32 = 15_000;
pub const DEFAULT_DT_MS: u16 = 100;
/// A hit that leaves the victim at or below this HP is a "lethal-range" event (quotes freeze).
pub const LETHAL_HP: i16 = 12;

pub const N_PROJ: usize = 32;
pub const N_POWERUP: usize = 4;

pub const PHASE_LIVE: u8 = 0;
pub const PHASE_SUDDEN_DEATH: u8 = 1;
pub const PHASE_ENDED: u8 = 2;

pub const WINNER_NONE: u8 = 0;
pub const WINNER_A: u8 = 1;
pub const WINNER_B: u8 = 2;
pub const WINNER_DRAW: u8 = 3;

pub const PU_NONE: u8 = 0;
pub const PU_MEDKIT: u8 = 1;
pub const PU_OVERCHARGE: u8 = 2;
pub const PU_HASTE: u8 = 3;

// Event flags returned by `step`.
pub const EV_HIT_A: u32 = 1 << 0;
pub const EV_HIT_B: u32 = 1 << 1;
pub const EV_BLOCK_A: u32 = 1 << 2;
pub const EV_BLOCK_B: u32 = 1 << 3;
pub const EV_PICKUP_A: u32 = 1 << 4;
pub const EV_PICKUP_B: u32 = 1 << 5;
pub const EV_WAVE: u32 = 1 << 6;
pub const EV_SUDDEN_DEATH: u32 = 1 << 7;
pub const EV_END: u32 = 1 << 8;
pub const EV_LETHAL: u32 = 1 << 9;
pub const EV_FIRE_A: u32 = 1 << 10;
pub const EV_FIRE_B: u32 = 1 << 11;
pub const EV_DASH_A: u32 = 1 << 12;
pub const EV_DASH_B: u32 = 1 << 13;
pub const EV_SHIELD_A: u32 = 1 << 14;
pub const EV_SHIELD_B: u32 = 1 << 15;

/// Unit vectors for 16 directions (k·22.5°), Q16.16. Index 0 points +x, 4 points +y.
pub const COS16: [i32; 16] = [
    65536, 60547, 46341, 25080, 0, -25080, -46341, -60547, -65536, -60547, -46341, -25080, 0, 25080, 46341, 60547,
];

#[inline]
pub fn dir16(k: u8) -> (i64, i64) {
    let k = (k & 15) as usize;
    (COS16[k] as i64, COS16[(k + 12) & 15] as i64)
}

/// Direction index (0..16) closest to the vector (dx, dy). Returns 0 for a zero vector.
pub fn aim_at(dx: i64, dy: i64) -> u8 {
    let mut best = 0u8;
    let mut best_dot = i128::MIN;
    for k in 0..16u8 {
        let (cx, cy) = dir16(k);
        let d = cx as i128 * dx as i128 + cy as i128 * dy as i128;
        if d > best_dot {
            best_dot = d;
            best = k;
        }
    }
    best
}

/// Player input, packed in a u16: bits 0–3 move (0 = none, 1..=8 = 8 directions, 1 = +x, then
/// counter-clockwise in 45° steps), bit 4 fire, bit 5 dash, bit 6 shield, bits 8–11 aim (0..16).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Input {
    pub mv: u8,
    pub fire: bool,
    pub dash: bool,
    pub shield: bool,
    pub aim: u8,
}

impl Input {
    pub fn decode(bits: u16) -> Self {
        let mv = (bits & 0xf) as u8;
        Self {
            mv: if mv > 8 { 0 } else { mv },
            fire: bits & (1 << 4) != 0,
            dash: bits & (1 << 5) != 0,
            shield: bits & (1 << 6) != 0,
            aim: ((bits >> 8) & 0xf) as u8,
        }
    }
    pub fn encode(&self) -> u16 {
        (self.mv.min(8) as u16)
            | (self.fire as u16) << 4
            | (self.dash as u16) << 5
            | (self.shield as u16) << 6
            | ((self.aim & 15) as u16) << 8
    }
    /// Direction index (0..16) of the move, if any.
    pub fn move_dir16(&self) -> Option<u8> {
        if self.mv == 0 {
            None
        } else {
            Some((self.mv - 1) * 2)
        }
    }
}

/// Converts a 16-direction index to the nearest 8-direction move code (1..=8).
pub fn move_code_from_dir16(k: u8) -> u8 {
    (((k & 15) + 1) / 2) % 8 + 1
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Fighter {
    pub x: i32,
    pub y: i32,
    pub vx: i32,
    pub vy: i32,
    pub aim: u8,
    pub hp: i16,
    pub fire_cd: u16,
    pub dash_cd: u16,
    pub dash_ms: u16,
    pub dash_dir: u8,
    pub shield_cd: u16,
    pub shield_ms: u16,
    pub overcharge_ms: u16,
    pub haste_ms: u16,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Projectile {
    pub active: u8,
    pub owner: u8,
    pub dmg: u8,
    pub x: i32,
    pub y: i32,
    pub vx: i32,
    pub vy: i32,
    pub ttl: u16,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Powerup {
    pub kind: u8,
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SimState {
    pub tick: u32,
    pub time_ms: u32,
    pub dt_ms: u16,
    pub phase: u8,
    pub winner: u8,
    pub sd_ms: u16,
    pub wave_index: u16,
    pub next_wave_ms: u32,
    pub vrf_seed: [u8; 32],
    pub last_inputs: [u16; 2],
    pub fighters: [Fighter; 2],
    pub projectiles: [Projectile; N_PROJ],
    pub powerups: [Powerup; N_POWERUP],
}

/// Per-tick events.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Events {
    pub flags: u32,
    /// Damage taken this tick by A and B.
    pub damage: [u8; 2],
    /// Power-up kind picked up this tick by A and B (0 = none).
    pub pickups: [u8; 2],
}

impl Events {
    #[inline]
    pub fn has(&self, f: u32) -> bool {
        self.flags & f != 0
    }
}

impl SimState {
    /// Fresh match. `dt_ms` is the fixed timestep (the program's `tick_ms`).
    pub fn new(dt_ms: u16, vrf_seed: [u8; 32]) -> Self {
        let mk = |x: i64, aim: u8| Fighter {
            x: (x * FP) as i32,
            y: (ARENA_H / 2 * FP) as i32,
            aim,
            hp: MAX_HP,
            ..Default::default()
        };
        Self {
            tick: 0,
            time_ms: 0,
            dt_ms: if dt_ms == 0 { DEFAULT_DT_MS } else { dt_ms },
            phase: PHASE_LIVE,
            winner: WINNER_NONE,
            sd_ms: 0,
            wave_index: 0,
            next_wave_ms: WAVE_MS,
            vrf_seed,
            last_inputs: [0; 2],
            fighters: [mk(400, 0), mk(1600, 8)],
            projectiles: [Projectile::default(); N_PROJ],
            powerups: [Powerup::default(); N_POWERUP],
        }
    }

    #[inline]
    pub fn is_over(&self) -> bool {
        self.phase == PHASE_ENDED
    }

    /// Regulation time left in ms (0 in sudden death).
    pub fn time_left_ms(&self) -> u32 {
        MATCH_MS.saturating_sub(self.time_ms)
    }
}

/// SplitMix64 step, used for deterministic wave layouts and bot decisions.
#[inline]
pub fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

fn seed_word(seed: &[u8; 32], wave_index: u16) -> u64 {
    let mut s = 0u64;
    for (i, chunk) in seed.chunks(8).enumerate() {
        let w = u64::from_le_bytes(chunk.try_into().unwrap());
        s ^= w.rotate_left(i as u32 * 13);
    }
    s ^ (wave_index as u64).wrapping_mul(0xD6E8_FEB8_6659_FD93)
}

/// Power-up layout for a wave: 2–4 power-ups, kinds and positions from the seed.
pub fn spawn_wave(seed: &[u8; 32], wave_index: u16) -> [Powerup; N_POWERUP] {
    let mut s = seed_word(seed, wave_index);
    let n = 2 + (splitmix64(&mut s) % 3) as usize;
    let mut out = [Powerup::default(); N_POWERUP];
    for p in out.iter_mut().take(n) {
        let kind = 1 + (splitmix64(&mut s) % 3) as u8;
        let x = 200 + (splitmix64(&mut s) % 1600) as i64;
        let y = 150 + (splitmix64(&mut s) % 900) as i64;
        *p = Powerup {
            kind,
            x: (x * FP) as i32,
            y: (y * FP) as i32,
        };
    }
    out
}

#[inline]
fn dist2(ax: i32, ay: i32, bx: i32, by: i32) -> i64 {
    let dx = (ax as i64 - bx as i64) >> 8; // Q16.16 → Q8.8 keeps the square in range
    let dy = (ay as i64 - by as i64) >> 8;
    dx * dx + dy * dy
}

#[inline]
fn r2(r: i64) -> i64 {
    let r = r * (FP >> 8);
    r * r
}

#[inline]
fn per_tick(speed: i64, unit_q16: i64, dt_ms: u16) -> i64 {
    unit_q16 * speed * dt_ms as i64 / 1000
}

#[inline]
fn clamp_pos(v: i64, max_units: i64) -> i32 {
    v.clamp(FIGHTER_R * FP, (max_units - FIGHTER_R) * FP) as i32
}

/// Advances the match by one fixed timestep.
pub fn step(s: &mut SimState, inputs: [u16; 2]) -> Events {
    let mut ev = Events::default();
    if s.phase == PHASE_ENDED {
        return ev;
    }
    let dt = s.dt_ms;
    s.tick = s.tick.wrapping_add(1);
    s.time_ms = s.time_ms.saturating_add(dt as u32);
    s.last_inputs = inputs;
    let ins = [Input::decode(inputs[0]), Input::decode(inputs[1])];

    // 1. Timers, abilities and movement, A then B.
    for i in 0..2 {
        let f = &mut s.fighters[i];
        let inp = ins[i];
        f.fire_cd = f.fire_cd.saturating_sub(dt);
        f.dash_cd = f.dash_cd.saturating_sub(dt);
        f.dash_ms = f.dash_ms.saturating_sub(dt);
        f.shield_cd = f.shield_cd.saturating_sub(dt);
        f.shield_ms = f.shield_ms.saturating_sub(dt);
        f.overcharge_ms = f.overcharge_ms.saturating_sub(dt);
        f.haste_ms = f.haste_ms.saturating_sub(dt);
        f.aim = inp.aim & 15;

        if inp.shield && f.shield_cd == 0 && f.shield_ms == 0 {
            f.shield_ms = SHIELD_MS;
            f.shield_cd = SHIELD_CD_MS;
            ev.flags |= if i == 0 { EV_SHIELD_A } else { EV_SHIELD_B };
        }
        if inp.dash && f.dash_cd == 0 {
            f.dash_ms = DASH_MS;
            f.dash_cd = DASH_CD_MS;
            f.dash_dir = inp.move_dir16().unwrap_or(f.aim);
            ev.flags |= if i == 0 { EV_DASH_A } else { EV_DASH_B };
        }
        let (vx, vy) = if f.dash_ms > 0 {
            let (ux, uy) = dir16(f.dash_dir);
            (per_tick(DASH_SPEED, ux, dt), per_tick(DASH_SPEED, uy, dt))
        } else if let Some(k) = inp.move_dir16() {
            let sp = if f.haste_ms > 0 { SPEED * HASTE_PCT / 100 } else { SPEED };
            let (ux, uy) = dir16(k);
            (per_tick(sp, ux, dt), per_tick(sp, uy, dt))
        } else {
            (0, 0)
        };
        f.vx = vx as i32;
        f.vy = vy as i32;
        f.x = clamp_pos(f.x as i64 + vx, ARENA_W);
        f.y = clamp_pos(f.y as i64 + vy, ARENA_H);
    }

    // 2. Fighter–fighter separation (push both apart along the centre line).
    {
        let (a, b) = (s.fighters[0], s.fighters[1]);
        let dx = (b.x as i64 - a.x as i64) >> 8;
        let dy = (b.y as i64 - a.y as i64) >> 8;
        let d2 = dx * dx + dy * dy;
        let min = 2 * FIGHTER_R * (FP >> 8);
        if d2 < min * min {
            let d = ringside_fixed::isqrt_u64(d2 as u64) as i64;
            let (nx, ny) = if d == 0 {
                (FP >> 8, 0)
            } else {
                (dx * (FP >> 8) / d, dy * (FP >> 8) / d)
            };
            let push = (min - d + 1) / 2; // Q8.8
            let px = (nx * push) >> 8; // Q8.8
            let py = (ny * push) >> 8;
            let fa = &mut s.fighters[0];
            fa.x = clamp_pos(fa.x as i64 - (px << 8), ARENA_W);
            fa.y = clamp_pos(fa.y as i64 - (py << 8), ARENA_H);
            let fb = &mut s.fighters[1];
            fb.x = clamp_pos(fb.x as i64 + (px << 8), ARENA_W);
            fb.y = clamp_pos(fb.y as i64 + (py << 8), ARENA_H);
        }
    }

    // 3. Firing.
    for i in 0..2 {
        if !ins[i].fire || s.fighters[i].fire_cd != 0 {
            continue;
        }
        if let Some(slot) = s.projectiles.iter().position(|p| p.active == 0) {
            let f = &mut s.fighters[i];
            let (ux, uy) = dir16(f.aim);
            let off = FIGHTER_R + PROJ_R + 2;
            s.projectiles[slot] = Projectile {
                active: 1,
                owner: i as u8,
                dmg: if f.overcharge_ms > 0 { HIT_DMG * 2 } else { HIT_DMG },
                x: (f.x as i64 + ux * off) as i32,
                y: (f.y as i64 + uy * off) as i32,
                vx: per_tick(PROJ_SPEED, ux, dt) as i32,
                vy: per_tick(PROJ_SPEED, uy, dt) as i32,
                ttl: PROJ_TTL_MS,
            };
            f.fire_cd = FIRE_CD_MS;
            ev.flags |= if i == 0 { EV_FIRE_A } else { EV_FIRE_B };
        }
    }

    // 4. Projectiles: 4 sub-steps so they cannot tunnel through a fighter.
    let hit_r2 = r2(FIGHTER_R + PROJ_R);
    for idx in 0..N_PROJ {
        if s.projectiles[idx].active == 0 {
            continue;
        }
        let target = 1 - s.projectiles[idx].owner as usize;
        for _ in 0..4 {
            let p = &mut s.projectiles[idx];
            p.x = p.x.saturating_add(p.vx / 4);
            p.y = p.y.saturating_add(p.vy / 4);
            let (px, py) = (p.x as i64, p.y as i64);
            if px < 0 || py < 0 || px > ARENA_W * FP || py > ARENA_H * FP {
                p.active = 0;
                break;
            }
            let t = s.fighters[target];
            if dist2(p.x, p.y, t.x, t.y) <= hit_r2 {
                let (ax, ay) = dir16(t.aim);
                let frontal = (p.vx as i64 * ax + p.vy as i64 * ay) < 0;
                let dmg = p.dmg;
                p.active = 0;
                if t.shield_ms > 0 && frontal {
                    ev.flags |= if target == 0 { EV_BLOCK_A } else { EV_BLOCK_B };
                } else {
                    let tf = &mut s.fighters[target];
                    tf.hp = tf.hp.saturating_sub(dmg as i16);
                    ev.damage[target] = ev.damage[target].saturating_add(dmg);
                    ev.flags |= if target == 0 { EV_HIT_A } else { EV_HIT_B };
                    if tf.hp <= LETHAL_HP {
                        ev.flags |= EV_LETHAL;
                    }
                }
                break;
            }
        }
        let p = &mut s.projectiles[idx];
        if p.active != 0 {
            p.ttl = p.ttl.saturating_sub(dt);
            if p.ttl == 0 {
                p.active = 0;
            }
        }
    }

    // 5. Power-up pickups (slot order, A before B).
    let pick_r2 = r2(FIGHTER_R + POWERUP_R);
    for k in 0..N_POWERUP {
        let pu = s.powerups[k];
        if pu.kind == PU_NONE {
            continue;
        }
        for i in 0..2 {
            let f = &mut s.fighters[i];
            if dist2(f.x, f.y, pu.x, pu.y) <= pick_r2 {
                match pu.kind {
                    PU_MEDKIT => f.hp = (f.hp + MEDKIT_HP).min(MAX_HP),
                    PU_OVERCHARGE => f.overcharge_ms = OVERCHARGE_MS,
                    _ => f.haste_ms = HASTE_MS,
                }
                ev.pickups[i] = pu.kind;
                ev.flags |= if i == 0 { EV_PICKUP_A } else { EV_PICKUP_B };
                s.powerups[k] = Powerup::default();
                break;
            }
        }
    }

    // 6. VRF power-up waves.
    if s.time_ms >= s.next_wave_ms {
        s.powerups = spawn_wave(&s.vrf_seed, s.wave_index);
        s.wave_index = s.wave_index.wrapping_add(1);
        s.next_wave_ms = s.next_wave_ms.saturating_add(WAVE_MS);
        ev.flags |= EV_WAVE;
    }

    // 7. Outcome.
    let (ha, hb) = (s.fighters[0].hp, s.fighters[1].hp);
    let higher = |a: i16, b: i16| {
        if a > b {
            WINNER_A
        } else if b > a {
            WINNER_B
        } else {
            WINNER_DRAW
        }
    };
    if ha <= 0 || hb <= 0 {
        s.phase = PHASE_ENDED;
        s.winner = higher(ha, hb);
        ev.flags |= EV_END;
    } else if s.phase == PHASE_LIVE && s.time_ms >= MATCH_MS {
        if ha != hb {
            s.phase = PHASE_ENDED;
            s.winner = higher(ha, hb);
            ev.flags |= EV_END;
        } else {
            s.phase = PHASE_SUDDEN_DEATH;
            s.sd_ms = 0;
            ev.flags |= EV_SUDDEN_DEATH;
        }
    } else if s.phase == PHASE_SUDDEN_DEATH {
        if ha != hb {
            s.phase = PHASE_ENDED;
            s.winner = higher(ha, hb);
            ev.flags |= EV_END;
        } else {
            s.sd_ms = s.sd_ms.saturating_add(dt);
            if s.sd_ms >= SUDDEN_DEATH_MS {
                s.phase = PHASE_ENDED;
                s.winner = WINNER_DRAW;
                ev.flags |= EV_END;
            }
        }
    }
    ev
}

/// Hash-chain link: sha256(prev ‖ tick (u64 LE) ‖ canonical_bytes(state)).
#[cfg(feature = "hash")]
pub fn hash_link(prev: &[u8; 32], tick: u64, state_bytes: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(prev);
    h.update(tick.to_le_bytes());
    h.update(state_bytes);
    h.finalize().into()
}

/// Genesis hash of a match: link from the zero hash at tick 0 over the initial state.
#[cfg(feature = "hash")]
pub fn genesis_hash(s: &SimState) -> [u8; 32] {
    hash_link(&[0u8; 32], 0, &encode(s))
}

/// Derives the seed the offline simulator uses for wave `w` (stands in for a VRF result).
pub fn offline_wave_seed(match_seed: u64, w: u16) -> [u8; 32] {
    let mut s = match_seed ^ (w as u64).wrapping_mul(0xA24B_AED4_963E_E407);
    let mut out = [0u8; 32];
    for c in out.chunks_mut(8) {
        c.copy_from_slice(&splitmix64(&mut s).to_le_bytes());
    }
    out
}

#[cfg(test)]
mod tests;

/// A VRF seed that became visible to the match just before tick `apply_at_tick` was stepped.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SeedEvent {
    pub apply_at_tick: u32,
    pub seed: [u8; 32],
}

/// Replays a match from its initial state, inputs and VRF seed events, calling `on_link` with
/// (tick, hash) after every step. Returns the final state and final hash.
///
/// This is the function the browser (WASM) and Python call to verify the onchain hash chain.
#[cfg(feature = "hash")]
pub fn replay<F: FnMut(u32, &[u8; 32])>(
    initial: SimState,
    inputs: &[[u16; 2]],
    seeds: &[SeedEvent],
    mut on_link: F,
) -> (SimState, [u8; 32]) {
    let mut s = initial;
    let mut h = genesis_hash(&s);
    let mut si = 0;
    for inp in inputs {
        if s.is_over() {
            break;
        }
        let next = s.tick.wrapping_add(1);
        while si < seeds.len() && seeds[si].apply_at_tick <= next {
            s.vrf_seed = seeds[si].seed;
            si += 1;
        }
        step(&mut s, *inp);
        h = hash_link(&h, s.tick as u64, &encode(&s));
        on_link(s.tick, &h);
    }
    (s, h)
}

/// Deterministic random episode used by the cross-target determinism test. Generates inputs and
/// seed events from `episode` with SplitMix64 so every target can rebuild the same episode.
pub fn determinism_episode(episode: u64, max_ticks: usize, inputs: &mut [[u16; 2]], seeds: &mut [SeedEvent]) -> (SimState, usize, usize) {
    let mut r = episode.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ 0x5EED;
    let mut seed0 = [0u8; 32];
    for c in seed0.chunks_mut(8) {
        c.copy_from_slice(&splitmix64(&mut r).to_le_bytes());
    }
    let n = (max_ticks / 2 + (splitmix64(&mut r) % (max_ticks as u64 / 2 + 1)) as usize).min(inputs.len());
    let mut held = [0u16; 2];
    for slot in inputs.iter_mut().take(n) {
        for h in held.iter_mut() {
            if splitmix64(&mut r) % 4 == 0 {
                *h = splitmix64(&mut r) as u16 & 0x0f7f;
            }
        }
        *slot = held;
    }
    let ns = (1 + (splitmix64(&mut r) % 6) as usize).min(seeds.len());
    let mut t = 0u32;
    for ev in seeds.iter_mut().take(ns) {
        t += 1 + (splitmix64(&mut r) % 200) as u32;
        let mut sd = [0u8; 32];
        for c in sd.chunks_mut(8) {
            c.copy_from_slice(&splitmix64(&mut r).to_le_bytes());
        }
        *ev = SeedEvent {
            apply_at_tick: t,
            seed: sd,
        };
    }
    (SimState::new(DEFAULT_DT_MS, seed0), n, ns)
}
