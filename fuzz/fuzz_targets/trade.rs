//! Fuzzes the trade math: arbitrary order sequences against arbitrary quotes and limits.
//! Invariants: no panic; USDC conserved between users and the house; share counts equal house
//! inventory; worst-case house loss never above the cap; prices stay in [0.01, 0.99], bid < ask;
//! settlement pays exactly the house liability for the outcome.
#![no_main]
use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use ringside_fixed::quote::{quote, QuoteInputs, SpreadParams, PAYOUT, PRICE_MAX, PRICE_MIN};
use ringside_fixed::trade::{claim_amount, execute, worst_case_loss, Book, Dir, Limits, Outcome, Pos, Side};

#[derive(Arbitrary, Debug)]
struct Order {
    user: u8,
    side: bool,
    buy: bool,
    qty: u16,
    p: u32,
    vol: u32,
    time_left: u32,
    limit: u32,
}

#[derive(Arbitrary, Debug)]
struct Case {
    cap: u32,
    max_qty: u8,
    sp: (u32, u16, u32, u32),
    outcome: u8,
    orders: Vec<Order>,
}

fuzz_target!(|c: Case| {
    let lim = Limits { cap: c.cap as u64 * 1_000, max_qty: c.max_qty as u64 };
    let sp = SpreadParams { s_base: c.sp.0 as u64 % 500_000, s_vol_bps: c.sp.1 as u64, s_time: c.sp.2 as u64 % 500_000, k_skew: c.sp.3 as u64 % 500_000 };
    let mut book = Book::default();
    let mut pos = [Pos::default(); 8];
    let mut cash = [0i128; 8];
    for o in c.orders.iter().take(256) {
        let q = quote(&QuoteInputs { p: o.p, vol: o.vol as u64, time_left_ms: o.time_left as u64, total_ms: 90_000, inv_a: book.inv_a, inv_b: book.inv_b, cap: lim.cap }, &sp);
        assert!(q.bid_a < q.ask_a && q.bid_b < q.ask_b);
        for v in [q.bid_a, q.ask_a, q.bid_b, q.ask_b] {
            assert!((PRICE_MIN..=PRICE_MAX).contains(&v));
        }
        let u = (o.user % 8) as usize;
        let side = if o.side { Side::A } else { Side::B };
        let dir = if o.buy { Dir::Buy } else { Dir::Sell };
        if let Ok(f) = execute(&mut book, &mut pos[u], &q, side, dir, o.qty as u64, o.limit as u64, &lim) {
            cash[u] += if f.user_pays { -(f.cash as i128) } else { f.cash as i128 };
        }
        assert_eq!(cash.iter().sum::<i128>() + book.house_cash as i128, 0);
        assert_eq!(pos.iter().map(|p| p.shares_a).sum::<u64>(), book.inv_a);
        assert_eq!(pos.iter().map(|p| p.shares_b).sum::<u64>(), book.inv_b);
        assert!(worst_case_loss(&book).unwrap() <= lim.cap);
    }
    let out = [Outcome::A, Outcome::B, Outcome::Draw][(c.outcome % 3) as usize];
    let paid: u64 = pos.iter().map(|p| claim_amount(p, out).unwrap()).sum();
    match out {
        Outcome::A => assert_eq!(paid, book.inv_a * PAYOUT),
        Outcome::B => assert_eq!(paid, book.inv_b * PAYOUT),
        Outcome::Draw => {}
    }
});
