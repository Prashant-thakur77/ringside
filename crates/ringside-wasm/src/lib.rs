//! wasm-bindgen wrapper: the browser runs the exact same simulation, model and hash chain as the
//! onchain program.

use ringside_fixed::model::ModelParams;
use ringside_fixed::quote::{quote, QuoteInputs, SpreadParams};
use ringside_sim::bots::{Bot, Policy};
use ringside_sim::{self as sim, SeedEvent, SimState};
use wasm_bindgen::prelude::*;

fn state(bytes: &[u8]) -> Result<SimState, JsError> {
    sim::decode(bytes).ok_or_else(|| JsError::new("bad state length"))
}

fn seed32(b: &[u8]) -> Result<[u8; 32], JsError> {
    b.try_into().map_err(|_| JsError::new("seed must be 32 bytes"))
}

/// Size of the canonical state encoding.
#[wasm_bindgen(js_name = simBytes)]
pub fn sim_bytes() -> usize {
    sim::SIM_BYTES
}

/// Initial state bytes for a match.
#[wasm_bindgen(js_name = newState)]
pub fn new_state(dt_ms: u16, seed: &[u8]) -> Result<Vec<u8>, JsError> {
    Ok(sim::encode(&SimState::new(dt_ms, seed32(seed)?)).to_vec())
}

/// Steps a state; returns the new state bytes followed by 4 bytes of event flags (LE) and
/// 4 bytes of [dmgA, dmgB, pickupA, pickupB].
#[wasm_bindgen]
pub fn step(state_bytes: &[u8], input_a: u16, input_b: u16) -> Result<Vec<u8>, JsError> {
    let mut s = state(state_bytes)?;
    let ev = sim::step(&mut s, [input_a, input_b]);
    let mut out = sim::encode(&s).to_vec();
    out.extend_from_slice(&ev.flags.to_le_bytes());
    out.extend_from_slice(&[ev.damage[0], ev.damage[1], ev.pickups[0], ev.pickups[1]]);
    Ok(out)
}

/// JSON view of a state for rendering.
#[wasm_bindgen(js_name = stateJson)]
pub fn state_json(state_bytes: &[u8]) -> Result<String, JsError> {
    let s = state(state_bytes)?;
    let mut o = String::with_capacity(1024);
    let fp = sim::FP as f64;
    o.push_str(&format!(
        "{{\"tick\":{},\"timeMs\":{},\"phase\":{},\"winner\":{},\"sdMs\":{},\"waveIndex\":{},\"nextWaveMs\":{},\"fighters\":[",
        s.tick, s.time_ms, s.phase, s.winner, s.sd_ms, s.wave_index, s.next_wave_ms
    ));
    for (i, f) in s.fighters.iter().enumerate() {
        if i > 0 {
            o.push(',');
        }
        o.push_str(&format!(
            "{{\"x\":{},\"y\":{},\"vx\":{},\"vy\":{},\"aim\":{},\"hp\":{},\"fireCd\":{},\"dashCd\":{},\"dashMs\":{},\"shieldCd\":{},\"shieldMs\":{},\"overchargeMs\":{},\"hasteMs\":{}}}",
            f.x as f64 / fp, f.y as f64 / fp, f.vx as f64 / fp, f.vy as f64 / fp, f.aim, f.hp, f.fire_cd, f.dash_cd,
            f.dash_ms, f.shield_cd, f.shield_ms, f.overcharge_ms, f.haste_ms
        ));
    }
    o.push_str("],\"projectiles\":[");
    let mut first = true;
    for p in s.projectiles.iter().filter(|p| p.active != 0) {
        if !first {
            o.push(',');
        }
        first = false;
        o.push_str(&format!(
            "{{\"owner\":{},\"dmg\":{},\"x\":{},\"y\":{},\"vx\":{},\"vy\":{}}}",
            p.owner,
            p.dmg,
            p.x as f64 / fp,
            p.y as f64 / fp,
            p.vx as f64 / fp,
            p.vy as f64 / fp
        ));
    }
    o.push_str("],\"powerups\":[");
    let mut first = true;
    for p in s.powerups.iter().filter(|p| p.kind != 0) {
        if !first {
            o.push(',');
        }
        first = false;
        o.push_str(&format!(
            "{{\"kind\":{},\"x\":{},\"y\":{}}}",
            p.kind,
            p.x as f64 / fp,
            p.y as f64 / fp
        ));
    }
    o.push_str("]}");
    Ok(o)
}

/// The 16 Q32.32 pricing features.
#[wasm_bindgen]
pub fn features(state_bytes: &[u8]) -> Result<Vec<i64>, JsError> {
    Ok(sim::features(&state(state_bytes)?).to_vec())
}

/// Calibrated P(A wins) ×2^32 from model params bytes and a state.
#[wasm_bindgen]
pub fn predict(params: &[u8], state_bytes: &[u8]) -> Result<u32, JsError> {
    let m = ModelParams::from_bytes(params).map_err(|_| JsError::new("bad params"))?;
    m.predict(&sim::features(&state(state_bytes)?)).map_err(|_| JsError::new("math"))
}

/// Quotes [mid, bidA, askA, bidB, askB, spread] in micro-USDC.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn quotes(
    p: u32,
    vol: u64,
    time_left_ms: u64,
    inv_a: u64,
    inv_b: u64,
    cap: u64,
    s_base: u64,
    s_vol_bps: u64,
    s_time: u64,
    k_skew: u64,
) -> Vec<u64> {
    let q = quote(
        &QuoteInputs {
            p,
            vol,
            time_left_ms,
            total_ms: sim::MATCH_MS as u64,
            inv_a,
            inv_b,
            cap,
        },
        &SpreadParams {
            s_base,
            s_vol_bps,
            s_time,
            k_skew,
        },
    );
    vec![q.mid, q.bid_a, q.ask_a, q.bid_b, q.ask_b, q.spread]
}

/// Genesis hash of a state.
#[wasm_bindgen(js_name = genesisHash)]
pub fn genesis_hash(state_bytes: &[u8]) -> Result<Vec<u8>, JsError> {
    Ok(sim::genesis_hash(&state(state_bytes)?).to_vec())
}

/// One hash-chain link.
#[wasm_bindgen(js_name = hashLink)]
pub fn hash_link(prev: &[u8], tick: u64, state_bytes: &[u8]) -> Result<Vec<u8>, JsError> {
    Ok(sim::hash_link(&seed32(prev)?, tick, state_bytes).to_vec())
}

fn parse_seeds(seed_events: &[u8]) -> Result<Vec<SeedEvent>, JsError> {
    if seed_events.len() % 36 != 0 {
        return Err(JsError::new("seed events must be 36-byte records"));
    }
    Ok(seed_events
        .chunks(36)
        .map(|c| SeedEvent {
            apply_at_tick: u32::from_le_bytes(c[..4].try_into().unwrap()),
            seed: c[4..].try_into().unwrap(),
        })
        .collect())
}

/// Replays a match. `inputs` is a flat [a0, b0, a1, b1, …] array; `seed_events` holds 36-byte
/// records (u32 LE apply-at tick, 32-byte seed). Returns 32 bytes per tick (the hash chain).
#[wasm_bindgen]
pub fn replay(initial_state: &[u8], inputs: &[u16], seed_events: &[u8]) -> Result<Vec<u8>, JsError> {
    let init = state(initial_state)?;
    let ins: Vec<[u16; 2]> = inputs.chunks(2).map(|c| [c[0], *c.get(1).unwrap_or(&0)]).collect();
    let seeds = parse_seeds(seed_events)?;
    let mut out = Vec::with_capacity(ins.len() * 32);
    sim::replay(init, &ins, &seeds, |_, h| out.extend_from_slice(h));
    Ok(out)
}

/// Final state bytes after a replay (same arguments as `replay`).
#[wasm_bindgen(js_name = replayFinalState)]
pub fn replay_final_state(initial_state: &[u8], inputs: &[u16], seed_events: &[u8]) -> Result<Vec<u8>, JsError> {
    let init = state(initial_state)?;
    let ins: Vec<[u16; 2]> = inputs.chunks(2).map(|c| [c[0], *c.get(1).unwrap_or(&0)]).collect();
    let seeds = parse_seeds(seed_events)?;
    let (s, _) = sim::replay(init, &ins, &seeds, |_, _| {});
    Ok(sim::encode(&s).to_vec())
}

/// Final hash of determinism episode `episode` (same generator as native and Python).
#[wasm_bindgen(js_name = determinismEpisodeHash)]
pub fn determinism_episode_hash(episode: u64) -> Vec<u8> {
    let mut inputs = vec![[0u16; 2]; 1100];
    let mut seeds = [SeedEvent {
        apply_at_tick: 0,
        seed: [0; 32],
    }; 8];
    let (init, n, ns) = sim::determinism_episode(episode, 1100, &mut inputs, &mut seeds);
    sim::replay(init, &inputs[..n], &seeds[..ns], |_, _| {}).1.to_vec()
}

/// Direction index (0..16) toward (dx, dy).
#[wasm_bindgen(js_name = aimAt)]
pub fn aim_at(dx: f64, dy: f64) -> u8 {
    sim::aim_at((dx * 1024.0) as i64, (dy * 1024.0) as i64)
}

/// Packs an input.
#[wasm_bindgen(js_name = encodeInput)]
pub fn encode_input(mv: u8, fire: bool, dash: bool, shield: bool, aim: u8) -> u16 {
    sim::Input {
        mv,
        fire,
        dash,
        shield,
        aim,
    }
    .encode()
}

/// Default sigmoid LUT (1024 × u32), built with the integer exp.
#[wasm_bindgen(js_name = sigmoidLut)]
pub fn sigmoid_lut() -> Vec<u32> {
    ringside_fixed::build_sigmoid_lut().to_vec()
}

/// Scripted fighter usable from TypeScript bots.
#[wasm_bindgen]
pub struct ScriptedBot(Bot);

#[wasm_bindgen]
impl ScriptedBot {
    /// policy: 0 aggressive, 1 kiting, 2 defensive, 3 random. skill: 0..=1000.
    #[wasm_bindgen(constructor)]
    pub fn new(policy: u8, skill: u16, seed: u64) -> ScriptedBot {
        ScriptedBot(Bot::new(Policy::from_u8(policy), skill, seed))
    }
    pub fn act(&mut self, state_bytes: &[u8], me: u8) -> Result<u16, JsError> {
        Ok(self.0.act(&state(state_bytes)?, (me & 1) as usize))
    }
}

/// Policy observation (22 floats) for fighter `me`, identical to training.
#[wasm_bindgen]
pub fn observe(state_bytes: &[u8], me: u8) -> Result<Vec<f32>, JsError> {
    let mut out = vec![0f32; ringside_agent::OBS_DIM];
    ringside_agent::observe(&state(state_bytes)?, (me & 1) as usize, &mut out);
    Ok(out)
}

/// Discrete policy action (0..72) → input bits for fighter `me`.
#[wasm_bindgen(js_name = actionToInput)]
pub fn action_to_input(state_bytes: &[u8], me: u8, action: u32) -> Result<u16, JsError> {
    Ok(ringside_agent::action_to_input(
        &state(state_bytes)?,
        (me & 1) as usize,
        action as usize,
    ))
}
