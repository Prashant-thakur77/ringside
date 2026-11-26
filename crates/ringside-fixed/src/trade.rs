//! Fill math for trades against the house, shared by the program, fuzzing and the offline
//! courtsiding simulation. Every function is pure and overflow-checked.

use crate::quote::{Quotes, PAYOUT};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    A,
    B,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Dir {
    Buy,
    Sell,
}

/// The house's book for one match.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Book {
    /// A shares held by users (house pays these if A wins).
    pub inv_a: u64,
    /// B shares held by users.
    pub inv_b: u64,
    /// Net cash the house received from users in this match, micro-USDC (can be negative).
    pub house_cash: i64,
    /// Gross traded notional, micro-USDC.
    pub volume: u64,
    pub n_trades: u64,
}

/// One user's position in one match.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Pos {
    pub shares_a: u64,
    pub shares_b: u64,
    /// Net cash paid in (buys minus sell proceeds), micro-USDC.
    pub cost_basis: i64,
    /// Cash received from sells and claims, micro-USDC.
    pub realized: i64,
}

/// Risk limits for a match.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Limits {
    /// Maximum worst-case house loss for the match, micro-USDC.
    pub cap: u64,
    /// Maximum shares per trade.
    pub max_qty: u64,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TradeError {
    ZeroQty,
    MaxQty,
    Slippage,
    Exposure,
    InsufficientShares,
    Math,
}

/// Result of a fill. `user_pays` is true for buys (user → house), false for sells.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Fill {
    pub price: u64,
    pub qty: u64,
    pub cash: u64,
    pub user_pays: bool,
}

/// Worst-case house loss over both outcomes, micro-USDC (0 if the house wins either way).
pub fn worst_case_loss(book: &Book) -> Result<u64, TradeError> {
    let max_inv = book.inv_a.max(book.inv_b) as i128;
    let loss = max_inv * PAYOUT as i128 - book.house_cash as i128;
    if loss <= 0 {
        Ok(0)
    } else {
        u64::try_from(loss).map_err(|_| TradeError::Math)
    }
}

/// Executes a trade against the house at the current quotes. On error nothing is modified.
pub fn execute(
    book: &mut Book,
    pos: &mut Pos,
    q: &Quotes,
    side: Side,
    dir: Dir,
    qty: u64,
    limit_price: u64,
    limits: &Limits,
) -> Result<Fill, TradeError> {
    if qty == 0 {
        return Err(TradeError::ZeroQty);
    }
    if qty > limits.max_qty {
        return Err(TradeError::MaxQty);
    }
    let price = match (side, dir) {
        (Side::A, Dir::Buy) => q.ask_a,
        (Side::A, Dir::Sell) => q.bid_a,
        (Side::B, Dir::Buy) => q.ask_b,
        (Side::B, Dir::Sell) => q.bid_b,
    };
    match dir {
        Dir::Buy if price > limit_price => return Err(TradeError::Slippage),
        Dir::Sell if price < limit_price => return Err(TradeError::Slippage),
        _ => {}
    }
    let cash = qty.checked_mul(price).ok_or(TradeError::Math)?;
    let cash_i = i64::try_from(cash).map_err(|_| TradeError::Math)?;

    let mut nb = *book;
    let mut np = *pos;
    match dir {
        Dir::Buy => {
            match side {
                Side::A => {
                    nb.inv_a = nb.inv_a.checked_add(qty).ok_or(TradeError::Math)?;
                    np.shares_a = np.shares_a.checked_add(qty).ok_or(TradeError::Math)?;
                }
                Side::B => {
                    nb.inv_b = nb.inv_b.checked_add(qty).ok_or(TradeError::Math)?;
                    np.shares_b = np.shares_b.checked_add(qty).ok_or(TradeError::Math)?;
                }
            }
            nb.house_cash = nb.house_cash.checked_add(cash_i).ok_or(TradeError::Math)?;
            np.cost_basis = np.cost_basis.checked_add(cash_i).ok_or(TradeError::Math)?;
        }
        Dir::Sell => {
            match side {
                Side::A => {
                    np.shares_a = np.shares_a.checked_sub(qty).ok_or(TradeError::InsufficientShares)?;
                    nb.inv_a = nb.inv_a.checked_sub(qty).ok_or(TradeError::Math)?;
                }
                Side::B => {
                    np.shares_b = np.shares_b.checked_sub(qty).ok_or(TradeError::InsufficientShares)?;
                    nb.inv_b = nb.inv_b.checked_sub(qty).ok_or(TradeError::Math)?;
                }
            }
            nb.house_cash = nb.house_cash.checked_sub(cash_i).ok_or(TradeError::Math)?;
            np.cost_basis = np.cost_basis.checked_sub(cash_i).ok_or(TradeError::Math)?;
            np.realized = np.realized.checked_add(cash_i).ok_or(TradeError::Math)?;
        }
    }
    if worst_case_loss(&nb)? > limits.cap {
        return Err(TradeError::Exposure);
    }
    nb.volume = nb.volume.checked_add(cash).ok_or(TradeError::Math)?;
    nb.n_trades = nb.n_trades.checked_add(1).ok_or(TradeError::Math)?;
    *book = nb;
    *pos = np;
    Ok(Fill { price, qty, cash, user_pays: dir == Dir::Buy })
}

/// Match outcome for settlement.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    A,
    B,
    Draw,
}

/// What a position is owed at settlement: winning shares pay 1 USDC; a draw refunds net cost.
pub fn claim_amount(pos: &Pos, outcome: Outcome) -> Result<u64, TradeError> {
    match outcome {
        Outcome::A => pos.shares_a.checked_mul(PAYOUT).ok_or(TradeError::Math),
        Outcome::B => pos.shares_b.checked_mul(PAYOUT).ok_or(TradeError::Math),
        Outcome::Draw => Ok(pos.cost_basis.max(0) as u64),
    }
}

/// Fighter payout: winner gets 2×stake − fee; returns (payout, fee).
pub fn fighter_payout(stake: u64, fee_bps: u64) -> Result<(u64, u64), TradeError> {
    let pot = stake.checked_mul(2).ok_or(TradeError::Math)?;
    let fee = (pot as u128 * fee_bps as u128 / 10_000) as u64;
    Ok((pot - fee, fee))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quote::{quote, QuoteInputs, SpreadParams};
    use proptest::prelude::*;

    fn quotes(p: u32, book: &Book, cap: u64) -> Quotes {
        quote(
            &QuoteInputs { p, vol: 0, time_left_ms: 60_000, total_ms: 90_000, inv_a: book.inv_a, inv_b: book.inv_b, cap },
            &SpreadParams::default(),
        )
    }

    #[test]
    fn buy_then_sell_round_trip_costs_the_spread() {
        let mut b = Book::default();
        let mut p = Pos::default();
        let lim = Limits { cap: 1_000 * PAYOUT, max_qty: 100 };
        let q = quotes(1 << 31, &b, lim.cap);
        execute(&mut b, &mut p, &q, Side::A, Dir::Buy, 10, PAYOUT, &lim).unwrap();
        assert_eq!(p.shares_a, 10);
        assert_eq!(b.inv_a, 10);
        execute(&mut b, &mut p, &q, Side::A, Dir::Sell, 10, 0, &lim).unwrap();
        assert_eq!(p.shares_a, 0);
        assert_eq!(b.house_cash, 10 * (q.ask_a - q.bid_a) as i64);
    }

    #[test]
    fn rejects() {
        let mut b = Book::default();
        let mut p = Pos::default();
        let lim = Limits { cap: 5 * PAYOUT, max_qty: 20 };
        let q = quotes(1 << 31, &b, lim.cap);
        assert_eq!(execute(&mut b, &mut p, &q, Side::A, Dir::Buy, 0, PAYOUT, &lim), Err(TradeError::ZeroQty));
        assert_eq!(execute(&mut b, &mut p, &q, Side::A, Dir::Buy, 21, PAYOUT, &lim), Err(TradeError::MaxQty));
        assert_eq!(execute(&mut b, &mut p, &q, Side::A, Dir::Buy, 1, q.ask_a - 1, &lim), Err(TradeError::Slippage));
        assert_eq!(execute(&mut b, &mut p, &q, Side::A, Dir::Sell, 1, 0, &lim), Err(TradeError::InsufficientShares));
        assert_eq!(execute(&mut b, &mut p, &q, Side::A, Dir::Buy, 20, PAYOUT, &lim), Err(TradeError::Exposure));
        assert_eq!(b, Book::default());
        assert_eq!(p, Pos::default());
    }

    #[test]
    fn fighter_fee() {
        assert_eq!(fighter_payout(5_000_000, 100).unwrap(), (9_900_000, 100_000));
    }

    #[derive(Debug, Clone)]
    struct Op {
        user: usize,
        side: bool,
        buy: bool,
        qty: u64,
        p: u32,
    }

    fn op() -> impl Strategy<Value = Op> {
        (0usize..4, any::<bool>(), any::<bool>(), 1u64..30, any::<u32>())
            .prop_map(|(user, side, buy, qty, p)| Op { user, side, buy, qty, p })
    }

    proptest! {
        /// No value is created or destroyed: user cash + house cash is constant, share counts
        /// match inventory, the house's worst-case loss never exceeds the cap, and settlement pays
        /// out exactly the house liability for the outcome.
        #[test]
        fn conservation_and_cap(ops in proptest::collection::vec(op(), 1..200), cap_usdc in 1u64..500, outcome in 0u8..3) {
            let lim = Limits { cap: cap_usdc * PAYOUT, max_qty: 25 };
            let mut book = Book::default();
            let mut pos = [Pos::default(); 4];
            let mut user_cash = [0i128; 4];
            for o in ops {
                let q = quotes(o.p, &book, lim.cap);
                let side = if o.side { Side::A } else { Side::B };
                let dir = if o.buy { Dir::Buy } else { Dir::Sell };
                let limit = if o.buy { PAYOUT } else { 0 };
                if let Ok(f) = execute(&mut book, &mut pos[o.user], &q, side, dir, o.qty, limit, &lim) {
                    if f.user_pays { user_cash[o.user] -= f.cash as i128 } else { user_cash[o.user] += f.cash as i128 }
                }
                let total_users: i128 = user_cash.iter().sum();
                prop_assert_eq!(total_users + book.house_cash as i128, 0);
                prop_assert_eq!(pos.iter().map(|p| p.shares_a).sum::<u64>(), book.inv_a);
                prop_assert_eq!(pos.iter().map(|p| p.shares_b).sum::<u64>(), book.inv_b);
                prop_assert!(worst_case_loss(&book).unwrap() <= lim.cap);
            }
            let out = [Outcome::A, Outcome::B, Outcome::Draw][outcome as usize];
            let paid: u64 = pos.iter().map(|p| claim_amount(p, out).unwrap()).sum();
            match out {
                Outcome::A => prop_assert_eq!(paid, book.inv_a * PAYOUT),
                Outcome::B => prop_assert_eq!(paid, book.inv_b * PAYOUT),
                Outcome::Draw => prop_assert!(paid as i128 >= book.house_cash as i128),
            }
            if out != Outcome::Draw {
                // House loss for the realised outcome is bounded by the cap.
                prop_assert!(paid as i128 - book.house_cash as i128 <= lim.cap as i128);
            }
        }
    }
}
