//! Two-sided quotes for the "who wins" market.
//!
//! Prices are micro-USDC per share; a winning share pays [`PAYOUT`].

/// A winning share pays 1 USDC (6 decimals).
pub const PAYOUT: u64 = 1_000_000;
/// Lowest quotable price (0.01).
pub const PRICE_MIN: u64 = 10_000;
/// Highest quotable price (0.99).
pub const PRICE_MAX: u64 = 990_000;
/// Minimum gap between bid and ask (0.001).
pub const PRICE_TICK: u64 = 1_000;

/// Spread and skew parameters (stored in `Config.spread_params`).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct SpreadParams {
    /// Base spread, micro-USDC.
    pub s_base: u64,
    /// Volatility multiplier in basis points of |Δp over the last 10 ticks|.
    pub s_vol_bps: u64,
    /// Extra spread at the end of regulation time, micro-USDC (scales with elapsed time).
    pub s_time: u64,
    /// Maximum inventory skew, micro-USDC (reached at |inv_a − inv_b| = cap in shares).
    pub k_skew: u64,
}

impl Default for SpreadParams {
    fn default() -> Self {
        Self {
            s_base: 20_000,
            s_vol_bps: 5_000,
            s_time: 20_000,
            k_skew: 30_000,
        }
    }
}

/// Quotes for both sides. B mirrors A: ask_B = 1 − bid_A, bid_B = 1 − ask_A.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Quotes {
    pub mid: u64,
    pub bid_a: u64,
    pub ask_a: u64,
    pub bid_b: u64,
    pub ask_b: u64,
    pub spread: u64,
}

/// Inputs to the quote function.
#[derive(Clone, Copy, Debug)]
pub struct QuoteInputs {
    /// Calibrated P(A wins), probability ×2^32.
    pub p: u32,
    /// |mid now − mid 10 ticks ago|, micro-USDC.
    pub vol: u64,
    /// Regulation time left, ms.
    pub time_left_ms: u64,
    /// Regulation length, ms (90_000).
    pub total_ms: u64,
    /// Outstanding A shares held by users (house short A).
    pub inv_a: u64,
    /// Outstanding B shares held by users (house short B).
    pub inv_b: u64,
    /// House exposure cap for the match, micro-USDC.
    pub cap: u64,
}

/// Computes quotes. Pure integer math, never panics.
pub fn quote(q: &QuoteInputs, sp: &SpreadParams) -> Quotes {
    let mid = crate::prob_to_micro(q.p).clamp(PRICE_MIN, PRICE_MAX);
    let total = q.total_ms.max(1);
    let elapsed = total.saturating_sub(q.time_left_ms.min(total));
    let s_vol = (q.vol as u128 * sp.s_vol_bps as u128 / 10_000) as u64;
    let s_time = (sp.s_time as u128 * elapsed as u128 / total as u128) as u64;
    let spread = sp.s_base.saturating_add(s_vol).saturating_add(s_time).min(PRICE_MAX);

    let cap_shares = (q.cap / PAYOUT).max(1) as i128;
    let imbalance = q.inv_a as i128 - q.inv_b as i128;
    let k = sp.k_skew as i128;
    let skew = (k * imbalance / cap_shares).clamp(-k, k) as i64;

    let half = (spread / 2) as i64;
    let ask = (mid as i64 + half + skew).clamp((PRICE_MIN + PRICE_TICK) as i64, PRICE_MAX as i64) as u64;
    let bid = (mid as i64 - half + skew).clamp(PRICE_MIN as i64, (PRICE_MAX - PRICE_TICK) as i64) as u64;
    let bid = bid.min(ask - PRICE_TICK);
    Quotes {
        mid,
        bid_a: bid,
        ask_a: ask,
        bid_b: PAYOUT - ask,
        ask_b: PAYOUT - bid,
        spread,
    }
}

/// Stale-tick rule: a fill priced off `seen_tick` is rejected if the book has moved on by more
/// than `max` ticks, or if `seen_tick` is in the future.
#[inline]
pub fn is_stale(last_priced_tick: u64, seen_tick: u64, max: u64) -> bool {
    seen_tick > last_priced_tick || last_priced_tick - seen_tick > max
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn inputs(p: u32) -> QuoteInputs {
        QuoteInputs {
            p,
            vol: 0,
            time_left_ms: 90_000,
            total_ms: 90_000,
            inv_a: 0,
            inv_b: 0,
            cap: 200 * PAYOUT,
        }
    }

    #[test]
    fn even_match_is_symmetric() {
        let q = quote(&inputs(1 << 31), &SpreadParams::default());
        assert_eq!(q.mid, 500_000);
        assert_eq!(q.ask_a, 510_000);
        assert_eq!(q.bid_a, 490_000);
        assert_eq!(q.ask_b, 510_000);
        assert_eq!(q.bid_b, 490_000);
    }

    #[test]
    fn spread_widens_with_vol_and_time() {
        let sp = SpreadParams::default();
        let base = quote(&inputs(1 << 31), &sp).spread;
        let mut i = inputs(1 << 31);
        i.vol = 100_000;
        assert!(quote(&i, &sp).spread > base);
        let mut i = inputs(1 << 31);
        i.time_left_ms = 0;
        assert_eq!(quote(&i, &sp).spread, base + sp.s_time);
    }

    #[test]
    fn inventory_skews_toward_the_crowded_side() {
        let sp = SpreadParams::default();
        let mut i = inputs(1 << 31);
        i.inv_a = 50;
        let q = quote(&i, &sp);
        assert!(q.ask_a > 510_000 && q.bid_a > 490_000);
        assert!(q.ask_b < 510_000);
    }

    #[test]
    fn stale_rule() {
        assert!(!is_stale(10, 10, 2));
        assert!(!is_stale(10, 8, 2));
        assert!(is_stale(10, 7, 2));
        assert!(is_stale(10, 11, 2));
    }

    proptest! {
        #[test]
        fn quotes_bounded_and_ordered(
            p in any::<u32>(), vol in 0u64..2_000_000, tl in 0u64..200_000,
            ia in 0u64..10_000, ib in 0u64..10_000, cap in 0u64..1_000_000_000,
            sb in 0u64..1_000_000, sv in 0u64..50_000, st in 0u64..1_000_000, k in 0u64..1_000_000,
        ) {
            let q = quote(
                &QuoteInputs { p, vol, time_left_ms: tl, total_ms: 90_000, inv_a: ia, inv_b: ib, cap },
                &SpreadParams { s_base: sb, s_vol_bps: sv, s_time: st, k_skew: k },
            );
            for v in [q.bid_a, q.ask_a, q.bid_b, q.ask_b] {
                prop_assert!((PRICE_MIN..=PRICE_MAX).contains(&v));
            }
            prop_assert!(q.bid_a < q.ask_a);
            prop_assert!(q.bid_b < q.ask_b);
            prop_assert_eq!(q.ask_b + q.bid_a, PAYOUT);
            prop_assert_eq!(q.bid_b + q.ask_a, PAYOUT);
        }
    }
}
