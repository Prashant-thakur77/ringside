//! Canonical little-endian encoding of `SimState`. This is both the onchain storage format and
//! the byte string hashed into the state-hash chain.

use crate::{Fighter, Powerup, Projectile, SimState, N_POWERUP, N_PROJ};

const HEADER: usize = 4 + 4 + 2 + 1 + 1 + 2 + 2 + 4 + 32 + 4;
const FIGHTER: usize = 16 + 1 + 2 + 2 + 2 + 2 + 1 + 2 + 2 + 2 + 2;
const PROJ: usize = 3 + 16 + 2;
const PU: usize = 9;
/// Size of the canonical encoding.
pub const SIM_BYTES: usize = HEADER + 2 * FIGHTER + N_PROJ * PROJ + N_POWERUP * PU;

struct W<'a> {
    b: &'a mut [u8],
    o: usize,
}
impl W<'_> {
    fn put(&mut self, v: &[u8]) {
        self.b[self.o..self.o + v.len()].copy_from_slice(v);
        self.o += v.len();
    }
}
struct R<'a> {
    b: &'a [u8],
    o: usize,
}
impl R<'_> {
    fn take<const N: usize>(&mut self) -> [u8; N] {
        let v: [u8; N] = self.b[self.o..self.o + N].try_into().unwrap();
        self.o += N;
        v
    }
    fn u8(&mut self) -> u8 {
        self.take::<1>()[0]
    }
    fn u16(&mut self) -> u16 {
        u16::from_le_bytes(self.take())
    }
    fn i16(&mut self) -> i16 {
        i16::from_le_bytes(self.take())
    }
    fn u32(&mut self) -> u32 {
        u32::from_le_bytes(self.take())
    }
    fn i32(&mut self) -> i32 {
        i32::from_le_bytes(self.take())
    }
}

/// Encodes into a caller-provided buffer of exactly `SIM_BYTES`.
pub fn encode_into(s: &SimState, out: &mut [u8]) {
    assert_eq!(out.len(), SIM_BYTES);
    let mut w = W { b: out, o: 0 };
    w.put(&s.tick.to_le_bytes());
    w.put(&s.time_ms.to_le_bytes());
    w.put(&s.dt_ms.to_le_bytes());
    w.put(&[s.phase, s.winner]);
    w.put(&s.sd_ms.to_le_bytes());
    w.put(&s.wave_index.to_le_bytes());
    w.put(&s.next_wave_ms.to_le_bytes());
    w.put(&s.vrf_seed);
    w.put(&s.last_inputs[0].to_le_bytes());
    w.put(&s.last_inputs[1].to_le_bytes());
    for f in &s.fighters {
        for v in [f.x, f.y, f.vx, f.vy] {
            w.put(&v.to_le_bytes());
        }
        w.put(&[f.aim]);
        w.put(&f.hp.to_le_bytes());
        w.put(&f.fire_cd.to_le_bytes());
        w.put(&f.dash_cd.to_le_bytes());
        w.put(&f.dash_ms.to_le_bytes());
        w.put(&[f.dash_dir]);
        for v in [f.shield_cd, f.shield_ms, f.overcharge_ms, f.haste_ms] {
            w.put(&v.to_le_bytes());
        }
    }
    for p in &s.projectiles {
        w.put(&[p.active, p.owner, p.dmg]);
        for v in [p.x, p.y, p.vx, p.vy] {
            w.put(&v.to_le_bytes());
        }
        w.put(&p.ttl.to_le_bytes());
    }
    for p in &s.powerups {
        w.put(&[p.kind]);
        w.put(&p.x.to_le_bytes());
        w.put(&p.y.to_le_bytes());
    }
    debug_assert_eq!(w.o, SIM_BYTES);
}

/// Canonical bytes of a state.
pub fn encode(s: &SimState) -> [u8; SIM_BYTES] {
    let mut out = [0u8; SIM_BYTES];
    encode_into(s, &mut out);
    out
}

/// Decodes canonical bytes. Returns `None` if the length is wrong.
pub fn decode(b: &[u8]) -> Option<SimState> {
    if b.len() != SIM_BYTES {
        return None;
    }
    let mut r = R { b, o: 0 };
    let tick = r.u32();
    let time_ms = r.u32();
    let dt_ms = r.u16();
    let phase = r.u8();
    let winner = r.u8();
    let sd_ms = r.u16();
    let wave_index = r.u16();
    let next_wave_ms = r.u32();
    let vrf_seed = r.take::<32>();
    let last_inputs = [r.u16(), r.u16()];
    let mut fighters = [Fighter::default(); 2];
    for f in fighters.iter_mut() {
        f.x = r.i32();
        f.y = r.i32();
        f.vx = r.i32();
        f.vy = r.i32();
        f.aim = r.u8();
        f.hp = r.i16();
        f.fire_cd = r.u16();
        f.dash_cd = r.u16();
        f.dash_ms = r.u16();
        f.dash_dir = r.u8();
        f.shield_cd = r.u16();
        f.shield_ms = r.u16();
        f.overcharge_ms = r.u16();
        f.haste_ms = r.u16();
    }
    let mut projectiles = [Projectile::default(); N_PROJ];
    for p in projectiles.iter_mut() {
        p.active = r.u8();
        p.owner = r.u8();
        p.dmg = r.u8();
        p.x = r.i32();
        p.y = r.i32();
        p.vx = r.i32();
        p.vy = r.i32();
        p.ttl = r.u16();
    }
    let mut powerups = [Powerup::default(); N_POWERUP];
    for p in powerups.iter_mut() {
        p.kind = r.u8();
        p.x = r.i32();
        p.y = r.i32();
    }
    Some(SimState {
        tick,
        time_ms,
        dt_ms,
        phase,
        winner,
        sd_ms,
        wave_index,
        next_wave_ms,
        vrf_seed,
        last_inputs,
        fighters,
        projectiles,
        powerups,
    })
}
