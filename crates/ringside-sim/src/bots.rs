//! Scripted fighter policies: aggressive, kiting, defensive and random.
//!
//! Deterministic given their RNG seed. Used as PPO opponents, as data-generation players and,
//! through WASM, by the TypeScript fighter bots.

use crate::{aim_at, move_code_from_dir16, splitmix64, Input, SimState, FP, N_POWERUP, N_PROJ, PU_MEDKIT};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Policy {
    Aggressive = 0,
    Kiting = 1,
    Defensive = 2,
    Random = 3,
}

impl Policy {
    pub const ALL: [Policy; 4] = [Policy::Aggressive, Policy::Kiting, Policy::Defensive, Policy::Random];
    pub fn from_u8(v: u8) -> Self {
        match v % 4 {
            0 => Policy::Aggressive,
            1 => Policy::Kiting,
            2 => Policy::Defensive,
            _ => Policy::Random,
        }
    }
    pub fn name(&self) -> &'static str {
        match self {
            Policy::Aggressive => "aggressive",
            Policy::Kiting => "kiting",
            Policy::Defensive => "defensive",
            Policy::Random => "random",
        }
    }
}

/// A scripted fighter. `skill` (0..=1000) is the per-tick chance, in ‰, of reacting to the
/// current state instead of repeating the previous action, and also tightens aim.
#[derive(Clone, Debug)]
pub struct Bot {
    pub policy: Policy,
    pub skill: u16,
    rng: u64,
    last: Input,
    strafe: i8,
    hold: u16,
}

impl Bot {
    pub fn new(policy: Policy, skill: u16, seed: u64) -> Self {
        Self {
            policy,
            skill: skill.min(1000),
            rng: seed,
            last: Input::default(),
            strafe: 1,
            hold: 0,
        }
    }

    fn roll(&mut self, permille: u64) -> bool {
        splitmix64(&mut self.rng) % 1000 < permille
    }

    /// Chooses this tick's input for fighter `me` (0 = A, 1 = B).
    pub fn act(&mut self, s: &SimState, me: usize) -> u16 {
        if !self.roll(self.skill as u64) {
            return self.last.encode();
        }
        let f = s.fighters[me];
        let o = s.fighters[1 - me];
        let (mx, my) = (f.x as i64 / FP, f.y as i64 / FP);
        let (ox, oy) = (o.x as i64 / FP, o.y as i64 / FP);
        let (dx, dy) = (ox - mx, oy - my);
        let dist2 = dx * dx + dy * dy;
        let toward = aim_at(dx, dy);
        let away = (toward + 8) & 15;

        // Aim: lead the target slightly by its velocity, plus noise that shrinks with skill.
        // Better bots lead more often and by more ticks; everyone has some aim noise.
        let lead_ticks = if self.roll(self.skill as u64) {
            (self.skill / 200) as i64
        } else {
            0
        };
        let lead = aim_at(dx + (o.vx as i64 / FP) * lead_ticks, dy + (o.vy as i64 / FP) * lead_ticks);
        let noise_pm = 150 + (1000 - self.skill as u64) / 2;
        let mut aim = lead;
        if self.roll(noise_pm) {
            aim = if self.roll(500) { (aim + 1) & 15 } else { (aim + 15) & 15 };
        }

        // Incoming threat within 260 units.
        let mut threatened = false;
        for k in 0..N_PROJ {
            let p = s.projectiles[k];
            if p.active == 0 || p.owner as usize == me {
                continue;
            }
            let (pdx, pdy) = (mx - p.x as i64 / FP, my - p.y as i64 / FP);
            if pdx * pdx + pdy * pdy < 260 * 260 && (p.vx as i64 * pdx + p.vy as i64 * pdy) > 0 {
                threatened = true;
                break;
            }
        }

        // Nearest power-up (medkits preferred when hurt).
        let mut target_pu: Option<(i64, i64, i64)> = None;
        for k in 0..N_POWERUP {
            let p = s.powerups[k];
            if p.kind == 0 {
                continue;
            }
            let (px, py) = (p.x as i64 / FP - mx, p.y as i64 / FP - my);
            let mut d2 = px * px + py * py;
            if p.kind == PU_MEDKIT && f.hp < 70 {
                d2 /= 4;
            }
            if target_pu.is_none_or(|t| d2 < t.2) {
                target_pu = Some((px, py, d2));
            }
        }

        if self.hold == 0 {
            self.strafe = if self.roll(500) { 1 } else { -1 };
            self.hold = 5 + (splitmix64(&mut self.rng) % 15) as u16;
        } else {
            self.hold -= 1;
        }
        let strafe_dir = (toward as i16 + 4 * self.strafe as i16).rem_euclid(16) as u8;

        let mut inp = Input { aim, ..Default::default() };
        let mv_dir: Option<u8>;
        match self.policy {
            Policy::Aggressive => {
                mv_dir = if let Some((px, py, d2)) = target_pu.filter(|t| t.2 < 220 * 220) {
                    let _ = d2;
                    Some(aim_at(px, py))
                } else if dist2 > 340 * 340 {
                    Some(toward)
                } else {
                    Some(strafe_dir)
                };
                inp.fire = true;
                inp.dash = dist2 > 700 * 700 && self.roll(80);
                inp.shield = threatened && self.roll(400);
            }
            Policy::Kiting => {
                mv_dir = if let Some((px, py, _)) = target_pu.filter(|t| t.2 < 200 * 200) {
                    Some(aim_at(px, py))
                } else if dist2 < 520 * 520 {
                    Some(away)
                } else if dist2 > 760 * 760 {
                    Some(toward)
                } else {
                    Some(strafe_dir)
                };
                inp.fire = true;
                inp.dash = dist2 < 280 * 280 && self.roll(300);
                inp.shield = threatened && self.roll(500);
            }
            Policy::Defensive => {
                mv_dir = if let Some((px, py, _)) = target_pu.filter(|t| t.2 < 500 * 500) {
                    Some(aim_at(px, py))
                } else if dist2 < 850 * 850 {
                    Some(((away as i16 + 2 * self.strafe as i16).rem_euclid(16)) as u8)
                } else {
                    Some(strafe_dir)
                };
                inp.fire = self.roll(550);
                inp.dash = threatened && self.roll(200);
                inp.shield = threatened && self.roll(850);
            }
            Policy::Random => {
                if self.roll(250) || self.last.mv == 0 && self.roll(500) {
                    let r = splitmix64(&mut self.rng) % 9;
                    mv_dir = if r == 0 { None } else { Some(((r - 1) * 2) as u8) };
                } else {
                    mv_dir = self.last.move_dir16();
                }
                inp.fire = self.roll(350);
                inp.dash = self.roll(40);
                inp.shield = self.roll(50);
            }
        }
        inp.mv = mv_dir.map_or(0, move_code_from_dir16);
        self.last = inp;
        inp.encode()
    }
}

/// Result of an offline match between two bots.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MatchResult {
    pub winner: u8,
    pub ticks: u32,
    pub hp: [i16; 2],
}

/// Runs a full offline match. VRF wave seeds are derived from `match_seed` (stand-in for VRF).
pub fn run_match(a: &mut Bot, b: &mut Bot, match_seed: u64, dt_ms: u16) -> MatchResult {
    let mut s = SimState::new(dt_ms, crate::offline_wave_seed(match_seed, 0));
    while !s.is_over() {
        s.vrf_seed = crate::offline_wave_seed(match_seed, s.wave_index);
        let ia = a.act(&s, 0);
        let ib = b.act(&s, 1);
        crate::step(&mut s, [ia, ib]);
    }
    MatchResult {
        winner: s.winner,
        ticks: s.tick,
        hp: [s.fighters[0].hp, s.fighters[1].hp],
    }
}
