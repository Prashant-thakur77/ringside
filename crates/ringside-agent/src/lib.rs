//! Agent interface shared by training (Python) and inference (WASM in the TypeScript bots), so
//! the ONNX policy sees exactly the observations it was trained on.

use ringside_fixed::ONE;
use ringside_sim::{self as sim, Input, SimState, FP, N_FEATURES};

pub const OBS_DIM: usize = N_FEATURES + 6;
pub const N_ACTIONS: usize = 72;

/// State seen from fighter `me`: for me = 1 the fighters and projectile owners are swapped so the
/// agent is always "A" in the features.
pub fn perspective(s: &SimState, me: usize) -> SimState {
    if me == 0 {
        return s.clone();
    }
    let mut t = s.clone();
    t.fighters.swap(0, 1);
    for p in t.projectiles.iter_mut() {
        p.owner = 1 - p.owner;
    }
    t
}

/// 16 features + relative position, own position and opponent velocity (22 floats).
pub fn observe(s: &SimState, me: usize, out: &mut [f32]) {
    let v = perspective(s, me);
    let f = sim::features(&v);
    for i in 0..N_FEATURES {
        out[i] = (f[i] as f64 / ONE as f64) as f32;
    }
    let a = v.fighters[0];
    let b = v.fighters[1];
    let u = |x: i32| x as f64 / FP as f64;
    out[N_FEATURES] = ((u(b.x) - u(a.x)) / sim::ARENA_W as f64) as f32;
    out[N_FEATURES + 1] = ((u(b.y) - u(a.y)) / sim::ARENA_H as f64) as f32;
    out[N_FEATURES + 2] = (u(a.x) / sim::ARENA_W as f64) as f32;
    out[N_FEATURES + 3] = (u(a.y) / sim::ARENA_H as f64) as f32;
    out[N_FEATURES + 4] = (u(b.vx) / 140.0) as f32;
    out[N_FEATURES + 5] = (u(b.vy) / 140.0) as f32;
}

/// Discrete action (9 moves × fire × dash × shield) → input bits, aiming at the opponent with a
/// short velocity lead.
pub fn action_to_input(s: &SimState, me: usize, action: usize) -> u16 {
    let a = action % N_ACTIONS;
    let f = s.fighters[me];
    let o = s.fighters[1 - me];
    let dx = (o.x as i64 - f.x as i64) / FP + (o.vx as i64 / FP) * 4;
    let dy = (o.y as i64 - f.y as i64) / FP + (o.vy as i64 / FP) * 4;
    Input {
        mv: (a % 9) as u8,
        fire: (a / 9) % 2 == 1,
        dash: (a / 18) % 2 == 1,
        shield: (a / 36) % 2 == 1,
        aim: sim::aim_at(dx, dy),
    }
    .encode()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observation_is_finite_and_symmetric_at_start() {
        let s = SimState::new(100, [1; 32]);
        let mut a = [0f32; OBS_DIM];
        let mut b = [0f32; OBS_DIM];
        observe(&s, 0, &mut a);
        observe(&s, 1, &mut b);
        assert!(a.iter().all(|v| v.is_finite()));
        assert_eq!(a[0], 0.0);
        assert_eq!(a[N_FEATURES], -b[N_FEATURES]);
    }

    #[test]
    fn action_decoding_covers_all_bits() {
        let s = SimState::new(100, [1; 32]);
        let i = Input::decode(action_to_input(&s, 0, 71));
        assert!(i.fire && i.dash && i.shield && i.mv == 8);
        assert_eq!(Input::decode(action_to_input(&s, 0, 0)).mv, 0);
        assert_eq!(Input::decode(action_to_input(&s, 0, 0)).aim, 0, "A aims east at B");
    }
}
