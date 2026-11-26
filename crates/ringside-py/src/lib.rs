//! Python module `ringside_sim`: the same simulation, bots and integer model as the program.

use numpy::ndarray::Array2;
use numpy::{IntoPyArray, PyArray1, PyArray2, PyReadonlyArray1, PyReadonlyArray2};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyDict};
use rayon::prelude::*;
use ringside_fixed::model::ModelParams;
use ringside_fixed::{CALIB_LEN, LUT_LEN, ONE};
use rs_sim::bots::{Bot, Policy};
use rs_sim::{self as sim, Input, SeedEvent, SimState, FP, N_FEATURES};

pub const OBS_DIM: usize = N_FEATURES + 6;
pub const N_ACTIONS: usize = 72;

fn err<E: std::fmt::Debug>(e: E) -> PyErr {
    PyValueError::new_err(format!("{e:?}"))
}

/// State seen from fighter `me`: for me = 1 the fighters and projectile owners are swapped so the
/// agent is always "A" in the features.
fn perspective(s: &SimState, me: usize) -> SimState {
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

fn observe(s: &SimState, me: usize, out: &mut [f32]) {
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

/// Decodes a discrete action (9 moves × fire × dash × shield) into input bits, aiming at the
/// opponent with a short velocity lead.
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

struct OneEnv {
    s: SimState,
    match_seed: u64,
    agent_side: usize,
    opp_policy: u8,
    opp_skill: u16,
    bot: Bot,
}

/// Vectorised environment for PPO. The agent plays one side; the opponent is a scripted bot
/// (policy 0..=3) or external (policy 4, actions supplied to `step`). Auto-resets.
#[pyclass]
struct VecEnv {
    envs: Vec<OneEnv>,
    rng: u64,
    randomize_side: bool,
    /// Held-out envs draw odd match seeds; training envs draw even ones, so evaluation matches
    /// never appear in training.
    heldout: bool,
}

impl VecEnv {
    fn fresh(&mut self, i: usize) {
        let seed = (sim::splitmix64(&mut self.rng) & !1) | self.heldout as u64;
        let side = if self.randomize_side { (sim::splitmix64(&mut self.rng) & 1) as usize } else { 0 };
        let e = &mut self.envs[i];
        e.match_seed = seed;
        e.agent_side = side;
        e.s = SimState::new(sim::DEFAULT_DT_MS, sim::offline_wave_seed(seed, 0));
        e.bot = Bot::new(Policy::from_u8(e.opp_policy.min(3)), e.opp_skill, seed ^ 0xB07);
    }
}

#[pymethods]
impl VecEnv {
    #[new]
    #[pyo3(signature = (n, seed, randomize_side = true, heldout = false))]
    fn new(n: usize, seed: u64, randomize_side: bool, heldout: bool) -> Self {
        let mut v = VecEnv {
            envs: (0..n)
                .map(|_| OneEnv {
                    s: SimState::new(sim::DEFAULT_DT_MS, [0; 32]),
                    match_seed: 0,
                    agent_side: 0,
                    opp_policy: 0,
                    opp_skill: 900,
                    bot: Bot::new(Policy::Aggressive, 900, 0),
                })
                .collect(),
            rng: seed,
            randomize_side,
            heldout,
        };
        for i in 0..n {
            v.fresh(i);
        }
        v
    }

    #[getter]
    fn obs_dim(&self) -> usize {
        OBS_DIM
    }
    #[getter]
    fn n_actions(&self) -> usize {
        N_ACTIONS
    }

    /// Sets env i's opponent: policy 0..=3 scripted, 4 external. Takes effect at the next reset.
    fn set_opponent(&mut self, i: usize, policy: u8, skill: u16) {
        self.envs[i].opp_policy = policy;
        self.envs[i].opp_skill = skill;
    }

    fn reset_all<'py>(&mut self, py: Python<'py>) -> Bound<'py, PyArray2<f32>> {
        for i in 0..self.envs.len() {
            self.fresh(i);
        }
        self.obs(py)
    }

    /// Observations from the agent's side, shape (n, OBS_DIM).
    fn obs<'py>(&self, py: Python<'py>) -> Bound<'py, PyArray2<f32>> {
        let mut a = Array2::<f32>::zeros((self.envs.len(), OBS_DIM));
        for (i, e) in self.envs.iter().enumerate() {
            observe(&e.s, e.agent_side, a.row_mut(i).as_slice_mut().unwrap());
        }
        a.into_pyarray(py)
    }

    /// Observations from the opponent's side, shape (n, OBS_DIM).
    fn opp_obs<'py>(&self, py: Python<'py>) -> Bound<'py, PyArray2<f32>> {
        let mut a = Array2::<f32>::zeros((self.envs.len(), OBS_DIM));
        for (i, e) in self.envs.iter().enumerate() {
            observe(&e.s, 1 - e.agent_side, a.row_mut(i).as_slice_mut().unwrap());
        }
        a.into_pyarray(py)
    }

    /// Steps all envs. Returns (obs, reward, done, outcome) where outcome is +1 win, −1 loss,
    /// 0 draw for finished episodes (and 0 otherwise). Finished envs are reset.
    #[allow(clippy::type_complexity)]
    fn step<'py>(
        &mut self,
        py: Python<'py>,
        actions: PyReadonlyArray1<'py, i64>,
        opp_actions: PyReadonlyArray1<'py, i64>,
    ) -> PyResult<(Bound<'py, PyArray2<f32>>, Bound<'py, PyArray1<f32>>, Bound<'py, PyArray1<bool>>, Bound<'py, PyArray1<f32>>)> {
        let acts = actions.as_array();
        let opps = opp_actions.as_array();
        let n = self.envs.len();
        if acts.len() != n || opps.len() != n {
            return Err(PyValueError::new_err("action length mismatch"));
        }
        let mut rew = vec![0f32; n];
        let mut done = vec![false; n];
        let mut outcome = vec![0f32; n];
        for i in 0..n {
            let e = &mut self.envs[i];
            let me = e.agent_side;
            e.s.vrf_seed = sim::offline_wave_seed(e.match_seed, e.s.wave_index);
            let my_in = action_to_input(&e.s, me, acts[i].max(0) as usize);
            let op_in = if e.opp_policy >= 4 && opps[i] >= 0 {
                action_to_input(&e.s, 1 - me, opps[i] as usize)
            } else {
                e.bot.act(&e.s, 1 - me)
            };
            let inputs = if me == 0 { [my_in, op_in] } else { [op_in, my_in] };
            let ev = sim::step(&mut e.s, inputs);
            let dealt = ev.damage[1 - me] as f32;
            let taken = ev.damage[me] as f32;
            rew[i] = (dealt - taken) / 100.0;
            if e.s.is_over() {
                done[i] = true;
                let w = e.s.winner;
                outcome[i] = if w == sim::WINNER_DRAW {
                    0.0
                } else if (w == sim::WINNER_A) == (me == 0) {
                    1.0
                } else {
                    -1.0
                };
                rew[i] += outcome[i];
            }
        }
        for i in 0..n {
            if done[i] {
                self.fresh(i);
            }
        }
        Ok((self.obs(py), rew.into_pyarray(py), done.into_pyarray(py), outcome.into_pyarray(py)))
    }
}

/// Generates training rows for matches [start, start+n): every `every`-th tick of bot-vs-bot
/// matches with mixed pairings and skills. Returns a dict of numpy arrays.
#[pyfunction]
#[pyo3(signature = (start, n, base_seed, every = 5))]
fn generate_dataset<'py>(py: Python<'py>, start: u64, n: u64, base_seed: u64, every: u32) -> PyResult<Bound<'py, PyDict>> {
    struct Rows {
        x: Vec<i64>,
        mid: Vec<i64>,
        tick: Vec<i32>,
        y: Vec<f32>,
        hp: Vec<i16>,
        phase: Vec<u8>,
        meta: [i64; 5],
    }
    let every = every.max(1);
    let per: Vec<Rows> = py.allow_threads(|| {
        (start..start + n)
            .into_par_iter()
            .map(|m| {
                let mut r = base_seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ m.wrapping_mul(0xD1B5_4A32_D192_ED03);
                let pa = (sim::splitmix64(&mut r) % 4) as u8;
                let pb = (sim::splitmix64(&mut r) % 4) as u8;
                let ska = 550 + (sim::splitmix64(&mut r) % 451) as u16;
                let skb = 550 + (sim::splitmix64(&mut r) % 451) as u16;
                let match_seed = sim::splitmix64(&mut r);
                let mut a = Bot::new(Policy::from_u8(pa), ska, sim::splitmix64(&mut r));
                let mut b = Bot::new(Policy::from_u8(pb), skb, sim::splitmix64(&mut r));
                let mut s = SimState::new(sim::DEFAULT_DT_MS, sim::offline_wave_seed(match_seed, 0));
                let mut rows = Rows { x: vec![], mid: vec![], tick: vec![], y: vec![], hp: vec![], phase: vec![], meta: [m as i64, pa as i64, pb as i64, ska as i64, skb as i64] };
                while !s.is_over() {
                    if s.tick % every == 0 {
                        rows.x.extend_from_slice(&sim::features(&s));
                        rows.mid.push(m as i64);
                        rows.tick.push(s.tick as i32);
                        rows.hp.push(s.fighters[0].hp);
                        rows.hp.push(s.fighters[1].hp);
                        rows.phase.push(s.phase);
                    }
                    s.vrf_seed = sim::offline_wave_seed(match_seed, s.wave_index);
                    let ia = a.act(&s, 0);
                    let ib = b.act(&s, 1);
                    sim::step(&mut s, [ia, ib]);
                }
                let label = match s.winner {
                    sim::WINNER_A => 1.0,
                    sim::WINNER_B => 0.0,
                    _ => 0.5,
                };
                rows.y = vec![label; rows.mid.len()];
                rows
            })
            .collect()
    });
    let total: usize = per.iter().map(|r| r.mid.len()).sum();
    let mut x = Vec::with_capacity(total * N_FEATURES);
    let mut mid = Vec::with_capacity(total);
    let mut tick = Vec::with_capacity(total);
    let mut y = Vec::with_capacity(total);
    let mut hp = Vec::with_capacity(total * 2);
    let mut phase = Vec::with_capacity(total);
    let mut meta = Vec::with_capacity(per.len() * 5);
    for r in per {
        x.extend(r.x);
        mid.extend(r.mid);
        tick.extend(r.tick);
        y.extend(r.y);
        hp.extend(r.hp);
        phase.extend(r.phase);
        meta.extend_from_slice(&r.meta);
    }
    let d = PyDict::new(py);
    d.set_item("x", Array2::from_shape_vec((total, N_FEATURES), x).map_err(err)?.into_pyarray(py))?;
    d.set_item("match_id", mid.into_pyarray(py))?;
    d.set_item("tick", tick.into_pyarray(py))?;
    d.set_item("y", y.into_pyarray(py))?;
    d.set_item("hp", Array2::from_shape_vec((total, 2), hp).map_err(err)?.into_pyarray(py))?;
    d.set_item("phase", phase.into_pyarray(py))?;
    let nm = meta.len() / 5;
    d.set_item("match_meta", Array2::from_shape_vec((nm, 5), meta).map_err(err)?.into_pyarray(py))?;
    Ok(d)
}

/// Exact onchain integer model: calibrated P(A wins) ×2^32 for each row of raw Q32.32 features.
#[pyfunction]
#[pyo3(signature = (params, x, calibrated = true))]
fn predict_int<'py>(py: Python<'py>, params: &[u8], x: PyReadonlyArray2<'py, i64>, calibrated: bool) -> PyResult<Bound<'py, PyArray1<u32>>> {
    let m = ModelParams::from_bytes(params).map_err(err)?;
    let a = x.as_array();
    if a.ncols() != N_FEATURES {
        return Err(PyValueError::new_err("x must have 16 columns"));
    }
    let rows: Vec<[i64; N_FEATURES]> = a.rows().into_iter().map(|r| core::array::from_fn(|i| r[i])).collect();
    let out: PyResult<Vec<u32>> = py.allow_threads(|| {
        rows.par_iter()
            .map(|r| if calibrated { m.predict(r) } else { m.predict_raw(r) }.map_err(|e| format!("{e:?}")))
            .collect::<Result<Vec<_>, _>>()
            .map_err(PyValueError::new_err)
    });
    Ok(out?.into_pyarray(py))
}

/// Serializes model parameters to the onchain blob layout.
#[pyfunction]
fn params_to_bytes<'py>(py: Python<'py>, mean: Vec<i64>, inv_scale: Vec<i64>, weights: Vec<i64>, bias: i64, lut: Vec<u32>, calib: Vec<u32>) -> PyResult<Bound<'py, PyBytes>> {
    if mean.len() != N_FEATURES || inv_scale.len() != N_FEATURES || weights.len() != N_FEATURES || lut.len() != LUT_LEN || calib.len() != CALIB_LEN {
        return Err(PyValueError::new_err("bad lengths"));
    }
    let p = ModelParams {
        mean: mean.try_into().unwrap(),
        inv_scale: inv_scale.try_into().unwrap(),
        weights: weights.try_into().unwrap(),
        bias,
        lut: lut.try_into().unwrap(),
        calib: calib.try_into().unwrap(),
    };
    Ok(PyBytes::new(py, &p.to_bytes()))
}

#[pyfunction]
fn sigmoid_lut() -> Vec<u32> {
    ringside_fixed::build_sigmoid_lut().to_vec()
}

#[pyfunction]
fn new_state<'py>(py: Python<'py>, dt_ms: u16, seed: &[u8]) -> PyResult<Bound<'py, PyBytes>> {
    let seed: [u8; 32] = seed.try_into().map_err(err)?;
    Ok(PyBytes::new(py, &sim::encode(&SimState::new(dt_ms, seed))))
}

#[pyfunction]
fn step<'py>(py: Python<'py>, state: &[u8], a: u16, b: u16) -> PyResult<(Bound<'py, PyBytes>, u32)> {
    let mut s = sim::decode(state).ok_or_else(|| PyValueError::new_err("bad state"))?;
    let ev = sim::step(&mut s, [a, b]);
    Ok((PyBytes::new(py, &sim::encode(&s)), ev.flags))
}

#[pyfunction]
fn features(state: &[u8]) -> PyResult<Vec<i64>> {
    let s = sim::decode(state).ok_or_else(|| PyValueError::new_err("bad state"))?;
    Ok(sim::features(&s).to_vec())
}

fn parse_seeds(b: &[u8]) -> PyResult<Vec<SeedEvent>> {
    if b.len() % 36 != 0 {
        return Err(PyValueError::new_err("seed events must be 36-byte records"));
    }
    Ok(b.chunks(36).map(|c| SeedEvent { apply_at_tick: u32::from_le_bytes(c[..4].try_into().unwrap()), seed: c[4..].try_into().unwrap() }).collect())
}

/// Replays a match; returns the list of 32-byte chain hashes, one per tick.
#[pyfunction]
fn replay<'py>(py: Python<'py>, initial: &[u8], inputs: Vec<(u16, u16)>, seed_events: &[u8]) -> PyResult<Vec<Bound<'py, PyBytes>>> {
    let s = sim::decode(initial).ok_or_else(|| PyValueError::new_err("bad state"))?;
    let ins: Vec<[u16; 2]> = inputs.into_iter().map(|(a, b)| [a, b]).collect();
    let seeds = parse_seeds(seed_events)?;
    let mut out = Vec::new();
    sim::replay(s, &ins, &seeds, |_, h| out.push(PyBytes::new(py, h)));
    Ok(out)
}

#[pyfunction]
fn genesis_hash<'py>(py: Python<'py>, state: &[u8]) -> PyResult<Bound<'py, PyBytes>> {
    let s = sim::decode(state).ok_or_else(|| PyValueError::new_err("bad state"))?;
    Ok(PyBytes::new(py, &sim::genesis_hash(&s)))
}

/// Final hash of determinism episode `episode` (shared generator; see the Rust/WASM tests).
#[pyfunction]
fn determinism_episode_hash<'py>(py: Python<'py>, episode: u64) -> Bound<'py, PyBytes> {
    let mut inputs = vec![[0u16; 2]; 1100];
    let mut seeds = [SeedEvent { apply_at_tick: 0, seed: [0; 32] }; 8];
    let (init, n, ns) = sim::determinism_episode(episode, 1100, &mut inputs, &mut seeds);
    PyBytes::new(py, &sim::replay(init, &inputs[..n], &seeds[..ns], |_, _| {}).1)
}

/// Runs bot-vs-bot matches in parallel. Each row of `specs` is
/// [policy_a, skill_a, policy_b, skill_b, match_seed]. Returns (winner, ticks) arrays.
#[pyfunction]
fn run_matches<'py>(py: Python<'py>, specs: PyReadonlyArray2<'py, i64>) -> PyResult<(Bound<'py, PyArray1<u8>>, Bound<'py, PyArray1<u32>>)> {
    let rows: Vec<[i64; 5]> = specs.as_array().rows().into_iter().map(|r| core::array::from_fn(|i| r[i])).collect();
    let res: Vec<(u8, u32)> = py.allow_threads(|| {
        rows.par_iter()
            .map(|r| {
                let seed = r[4] as u64;
                let mut a = Bot::new(Policy::from_u8(r[0] as u8), r[1] as u16, seed ^ 0xA);
                let mut b = Bot::new(Policy::from_u8(r[2] as u8), r[3] as u16, seed ^ 0xB);
                let m = sim::bots::run_match(&mut a, &mut b, seed, sim::DEFAULT_DT_MS);
                (m.winner, m.ticks)
            })
            .collect()
    });
    let (w, t): (Vec<u8>, Vec<u32>) = res.into_iter().unzip();
    Ok((w.into_pyarray(py), t.into_pyarray(py)))
}

#[pyfunction]
fn encode_input(mv: u8, fire: bool, dash: bool, shield: bool, aim: u8) -> u16 {
    Input { mv, fire, dash, shield, aim }.encode()
}

#[pymodule]
fn ringside_sim(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<VecEnv>()?;
    m.add_function(wrap_pyfunction!(generate_dataset, m)?)?;
    m.add_function(wrap_pyfunction!(predict_int, m)?)?;
    m.add_function(wrap_pyfunction!(params_to_bytes, m)?)?;
    m.add_function(wrap_pyfunction!(sigmoid_lut, m)?)?;
    m.add_function(wrap_pyfunction!(new_state, m)?)?;
    m.add_function(wrap_pyfunction!(step, m)?)?;
    m.add_function(wrap_pyfunction!(features, m)?)?;
    m.add_function(wrap_pyfunction!(replay, m)?)?;
    m.add_function(wrap_pyfunction!(genesis_hash, m)?)?;
    m.add_function(wrap_pyfunction!(determinism_episode_hash, m)?)?;
    m.add_function(wrap_pyfunction!(run_matches, m)?)?;
    m.add_function(wrap_pyfunction!(encode_input, m)?)?;
    m.add("FEATURE_NAMES", sim::FEATURE_NAMES.to_vec())?;
    m.add("OBS_DIM", OBS_DIM)?;
    m.add("N_ACTIONS", N_ACTIONS)?;
    m.add("ONE", ONE)?;
    m.add("SIM_BYTES", sim::SIM_BYTES)?;
    Ok(())
}
