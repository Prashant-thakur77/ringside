//! Pricing: features → integer logistic model → quotes. The Ringside book runs this inside
//! `tick`; the TV-delay book runs the same code on relayed (old) features.

use crate::error::RingsideError;
use crate::state::{Config, Market};
use anchor_lang::prelude::*;
use ringside_fixed::model::{predict_bytes, N_FEATURES};
use ringside_fixed::quote::{quote, QuoteInputs, SpreadParams, PAYOUT};
use ringside_fixed::trade::{Book, Pos};

pub fn spread_params(cfg: &Config) -> SpreadParams {
    SpreadParams { s_base: cfg.s_base, s_vol_bps: cfg.s_vol_bps, s_time: cfg.s_time, k_skew: cfg.k_skew }
}

/// Model probability (×2^32) for a feature vector.
pub fn model_p(blob: &[u8], x: &[i64; N_FEATURES]) -> Result<u32> {
    predict_bytes(blob, x).map_err(|_| error!(RingsideError::ErrModel))
}

/// Re-prices a market at `tick` from probability `p` (×2^32).
pub fn requote(m: &mut Market, cfg: &Config, p: u32, time_left_ms: u64, tick: u64, lethal: bool) {
    let mid_now = ringside_fixed::prob_to_micro(p);
    // Ring buffer of the last 11 mids: vol = |mid now − mid 10 ticks ago|.
    let head = (m.p_hist_head as usize) % 11;
    let oldest = m.p_hist[(head + 1) % 11] as u64;
    m.p_hist[head] = mid_now as u32;
    m.p_hist_head = ((head + 1) % 11) as u8;
    let vol = if oldest == 0 { 0 } else { mid_now.abs_diff(oldest) };
    let q = quote(
        &QuoteInputs {
            p,
            vol,
            time_left_ms,
            total_ms: ringside_sim::MATCH_MS as u64,
            inv_a: m.inv_a,
            inv_b: m.inv_b,
            cap: m.cap,
        },
        &spread_params(cfg),
    );
    m.fair_p = p as i64;
    m.mid = q.mid;
    m.bid_a = q.bid_a;
    m.ask_a = q.ask_a;
    m.bid_b = q.bid_b;
    m.ask_b = q.ask_b;
    m.spread = q.spread;
    m.last_priced_tick = tick;
    if lethal {
        m.frozen_until_tick = tick.saturating_add(cfg.freeze_ticks as u64);
    }
}

pub fn book_of(m: &Market) -> Book {
    Book { inv_a: m.inv_a, inv_b: m.inv_b, house_cash: m.house_cash, volume: m.volume, n_trades: m.n_trades }
}

pub fn store_book(m: &mut Market, b: &Book) {
    m.inv_a = b.inv_a;
    m.inv_b = b.inv_b;
    m.house_cash = b.house_cash;
    m.volume = b.volume;
    m.n_trades = b.n_trades;
    m.house_liability_a = b.inv_a.saturating_mul(PAYOUT);
    m.house_liability_b = b.inv_b.saturating_mul(PAYOUT);
    if let Ok(w) = ringside_fixed::trade::worst_case_loss(b) {
        m.max_exposure_seen = m.max_exposure_seen.max(w);
    }
}

pub fn pos_of(p: &crate::state::Position) -> Pos {
    Pos { shares_a: p.shares_a, shares_b: p.shares_b, cost_basis: p.cost_basis, realized: p.realized }
}
