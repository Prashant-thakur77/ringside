//! Q32.32 fixed-point math shared by the Ringside program, the WASM build and the Python module.
//!
//! Everything here is integer-only so the onchain price, the browser replay and the offline
//! evaluation compute bit-identical numbers.
#![cfg_attr(not(feature = "std"), no_std)]

pub mod model;
pub mod quote;
pub mod trade;

/// One in Q32.32.
pub const ONE: i64 = 1 << 32;
/// ln(2) in Q32.32 (round(0.6931471805599453 * 2^32)).
pub const LN2: i64 = 2_977_044_472;

/// Converts an integer to Q32.32. Returns `None` on overflow.
#[inline]
pub fn from_int(v: i64) -> Option<i64> {
    v.checked_mul(ONE)
}

/// Q32.32 from a ratio `num / den`.
#[inline]
pub fn from_ratio(num: i64, den: i64) -> Option<i64> {
    if den == 0 {
        return None;
    }
    i64::try_from(((num as i128) << 32) / den as i128).ok()
}

/// Q32.32 multiply, floor rounding, overflow-checked.
#[inline]
pub fn mul(a: i64, b: i64) -> Option<i64> {
    i64::try_from((a as i128 * b as i128) >> 32).ok()
}

/// Q32.32 divide, overflow-checked.
#[inline]
pub fn div(a: i64, b: i64) -> Option<i64> {
    if b == 0 {
        return None;
    }
    i64::try_from(((a as i128) << 32) / b as i128).ok()
}

/// e^x in Q32.32. Returns `None` if the result does not fit (x > ~21.48). Returns 0 for x < -44.
///
/// Range reduction x = k·ln2 + r with r ∈ [0, ln2), then a 16-term Taylor series for e^r.
/// Error bound (tested): relative error < 5e-9 for x ∈ [-20, 20] (dominated by k·ln2 quantization).
pub fn exp(x: i64) -> Option<i64> {
    if x < -44 * ONE {
        return Some(0);
    }
    let k = x.div_euclid(LN2);
    let r = x - k * LN2; // in [0, LN2)
    let mut term: i128 = ONE as i128;
    let mut sum: i128 = ONE as i128;
    let r = r as i128;
    for n in 1..=16i128 {
        term = ((term * r) >> 32) / n;
        if term == 0 {
            break;
        }
        sum += term;
    }
    if k >= 0 {
        if k >= 31 {
            // sum >= 1.0 so shifting by 31+ leaves no headroom in Q32.32 i64.
            if k > 31 || sum > (i64::MAX >> 31) as i128 {
                return None;
            }
        }
        let shifted = sum.checked_shl(k as u32)?;
        i64::try_from(shifted).ok()
    } else {
        let s = (-k) as u32;
        if s >= 96 {
            return Some(0);
        }
        i64::try_from(sum >> s).ok()
    }
}

/// Natural log in Q32.32 for x > 0. Returns `None` for x <= 0.
///
/// Normalises x = m·2^k with m ∈ [1, 2), then ln(m) = 2·atanh((m−1)/(m+1)) by series.
/// Error bound (tested): absolute error < 1e-8 for x ∈ [2^-20, 2^20].
pub fn ln(x: i64) -> Option<i64> {
    if x <= 0 {
        return None;
    }
    let msb = 63 - x.leading_zeros() as i64; // position of the highest set bit
    let k = msb - 32;
    let m: i128 = if k >= 0 { (x as i128) >> k } else { (x as i128) << (-k) };
    let one = ONE as i128;
    let t = ((m - one) << 32) / (m + one); // t in [0, 1/3)
    let t2 = (t * t) >> 32;
    let mut pow = t;
    let mut series: i128 = 0;
    let mut n: i128 = 1;
    while n <= 27 {
        series += pow / n;
        pow = (pow * t2) >> 32;
        if pow == 0 {
            break;
        }
        n += 2;
    }
    let ln_m = 2 * series;
    i64::try_from(k as i128 * LN2 as i128 + ln_m).ok()
}

/// Logistic sigmoid in Q32.32, computed with the integer `exp`. Used to build the LUT.
pub fn sigmoid(z: i64) -> i64 {
    match exp(z.saturating_neg()) {
        Some(e) => {
            let den = (ONE as i128) + e as i128;
            (((ONE as i128) << 32) / den) as i64
        }
        None => 0,
    }
}

/// Number of entries in the sigmoid lookup table.
pub const LUT_LEN: usize = 1024;
/// Lowest z covered by the LUT (−16 in Q32.32).
pub const LUT_MIN: i64 = -16 * ONE;
/// log2 of LUT steps per unit of z (32 steps per unit → step 1/32).
pub const LUT_SHIFT: u32 = 5;

#[cfg(feature = "std")]
/// Builds the 1024-entry sigmoid LUT: entry i = sigmoid(−16 + i/32) as a u32 probability ×2^32.
pub fn build_sigmoid_lut() -> [u32; LUT_LEN] {
    let mut lut = [0u32; LUT_LEN];
    let step = ONE >> LUT_SHIFT;
    let mut i = 0;
    while i < LUT_LEN {
        let z = LUT_MIN + step * i as i64;
        let p = sigmoid(z);
        lut[i] = if p >= (1i64 << 32) { u32::MAX } else { p as u32 };
        i += 1;
    }
    lut
}

/// Sigmoid by LUT with linear interpolation. `z` in Q32.32; returns a probability ×2^32.
pub fn lut_sigmoid(z: i64, lut: &[u32; LUT_LEN]) -> u32 {
    if z <= LUT_MIN {
        return lut[0];
    }
    let off = (z - LUT_MIN) as u64; // >= 0
    let frac_bits = 32 - LUT_SHIFT;
    let idx = (off >> frac_bits) as usize;
    if idx >= LUT_LEN - 1 {
        return lut[LUT_LEN - 1];
    }
    let frac = (off & ((1u64 << frac_bits) - 1)) as i64;
    let a = lut[idx] as i64;
    let b = lut[idx + 1] as i64;
    let v = a + (((b - a) * frac) >> frac_bits);
    v.clamp(0, u32::MAX as i64) as u32
}

/// Number of knots in the isotonic calibration table (evenly spaced inputs 0, 1/63, …, 1).
pub const CALIB_LEN: usize = 64;

/// Piecewise-linear calibration: input and output are probabilities ×2^32.
pub fn calibrate(p: u32, table: &[u32; CALIB_LEN]) -> u32 {
    let pos = p as u64 * (CALIB_LEN as u64 - 1);
    let j = (pos >> 32) as usize;
    if j >= CALIB_LEN - 1 {
        return table[CALIB_LEN - 1];
    }
    let frac = (pos & 0xffff_ffff) as i128;
    let a = table[j] as i128;
    let b = table[j + 1] as i128;
    let v = a + (((b - a) * frac) >> 32);
    v.clamp(0, u32::MAX as i128) as u32
}

/// Integer square root (floor).
pub fn isqrt_u64(n: u64) -> u64 {
    if n < 2 {
        return n;
    }
    // Seed 2^ceil(bits/2) is always >= sqrt(n), so Newton descends monotonically.
    let bits = 64 - n.leading_zeros();
    let mut x = 1u64 << bits.div_ceil(2);
    // Newton iterations from a power-of-two seed; converge to floor(sqrt(n)).
    loop {
        let y = (x + n / x) / 2;
        if y >= x {
            break;
        }
        x = y;
    }
    while x.checked_mul(x).is_none_or(|v| v > n) {
        x -= 1;
    }
    while (x + 1).checked_mul(x + 1).is_some_and(|v| v <= n) {
        x += 1;
    }
    x
}

/// Converts a probability ×2^32 to micro-USDC per share (a share pays 1_000_000).
#[inline]
pub fn prob_to_micro(p: u32) -> u64 {
    (p as u64 * 1_000_000) >> 32
}

/// Converts a Q32.32 probability in [0, 1] to a u32 probability ×2^32 (saturating).
#[inline]
pub fn fx_to_prob(p: i64) -> u32 {
    p.clamp(0, u32::MAX as i64) as u32
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn f(x: i64) -> f64 {
        x as f64 / ONE as f64
    }
    fn q(x: f64) -> i64 {
        (x * ONE as f64).round() as i64
    }

    #[test]
    fn mul_div_basics() {
        assert_eq!(mul(q(1.5), q(2.0)), Some(q(3.0)));
        assert_eq!(div(q(3.0), q(2.0)), Some(q(1.5)));
        assert_eq!(div(ONE, 0), None);
        assert_eq!(mul(i64::MAX, i64::MAX), None);
        assert_eq!(from_ratio(1, 4), Some(ONE / 4));
    }

    #[test]
    fn exp_known_values() {
        assert!((f(exp(0).unwrap()) - 1.0).abs() < 1e-9);
        assert!((f(exp(ONE).unwrap()) - core::f64::consts::E).abs() < 1e-8);
        assert!((f(exp(-ONE).unwrap()) - (-1f64).exp()).abs() < 1e-9);
        assert_eq!(exp(30 * ONE), None);
        assert_eq!(exp(-50 * ONE), Some(0));
    }

    #[test]
    fn ln_known_values() {
        assert!(f(ln(ONE).unwrap()).abs() < 1e-9);
        assert!((f(ln(q(core::f64::consts::E)).unwrap()) - 1.0).abs() < 1e-8);
        assert!((f(ln(q(0.5)).unwrap()) + core::f64::consts::LN_2).abs() < 1e-8);
        assert_eq!(ln(0), None);
        assert_eq!(ln(-5), None);
    }

    #[test]
    fn lut_matches_float_sigmoid() {
        let lut = build_sigmoid_lut();
        let mut max_err = 0f64;
        let mut z = -16.0;
        while z < 16.0 {
            let p = lut_sigmoid(q(z), &lut) as f64 / 4294967296.0;
            let t = 1.0 / (1.0 + (-z as f64).exp());
            max_err = max_err.max((p - t).abs());
            z += 0.001_7;
        }
        assert!(max_err < 1.5e-5, "max lut error {max_err}");
    }

    #[test]
    fn lut_is_monotone_and_bounded() {
        let lut = build_sigmoid_lut();
        for w in lut.windows(2) {
            assert!(w[0] <= w[1]);
        }
        assert!(lut[0] < 1_000);
        assert!(lut[LUT_LEN - 1] > u32::MAX - 1_000);
    }

    #[test]
    fn calibration_identity_table() {
        let mut t = [0u32; CALIB_LEN];
        for (j, v) in t.iter_mut().enumerate() {
            *v = ((j as u64 * u32::MAX as u64) / 63) as u32;
        }
        for p in [0u32, 1 << 30, 1 << 31, 3 << 30, u32::MAX] {
            let c = calibrate(p, &t);
            assert!((c as i64 - p as i64).abs() < 4, "{p} -> {c}");
        }
    }

    #[test]
    fn isqrt_exact() {
        for n in [0u64, 1, 2, 3, 4, 15, 16, 17, 1 << 40, u64::MAX] {
            let r = isqrt_u64(n);
            assert!(r.checked_mul(r).unwrap() <= n);
            assert!((r + 1).checked_mul(r + 1).is_none_or(|v| v > n));
        }
    }

    proptest! {
        #[test]
        fn exp_relative_error(x in -20.0f64..20.0) {
            let got = f(exp(q(x)).unwrap());
            let want = x.exp();
            // absolute floor covers Q32.32 resolution for tiny results
            prop_assert!((got - want).abs() <= want * 5e-9 + 3.0 / ONE as f64, "x={x} got={got} want={want}");
        }

        #[test]
        fn ln_absolute_error(x in 0.000_001f64..1_000_000.0) {
            let got = f(ln(q(x)).unwrap());
            prop_assert!((got - x.ln()).abs() < 1e-8 + 1.0 / (x * ONE as f64), "x={x}");
        }

        #[test]
        fn exp_ln_roundtrip(x in 0.01f64..1000.0) {
            let y = exp(ln(q(x)).unwrap()).unwrap();
            prop_assert!((f(y) - x).abs() / x < 1e-7);
        }

        #[test]
        fn lut_sigmoid_monotone(a in -20.0f64..20.0, b in -20.0f64..20.0) {
            let lut = build_sigmoid_lut();
            let (lo, hi) = if a < b { (a, b) } else { (b, a) };
            prop_assert!(lut_sigmoid(q(lo), &lut) <= lut_sigmoid(q(hi), &lut));
        }

        #[test]
        fn isqrt_prop(n in any::<u64>()) {
            let r = isqrt_u64(n);
            prop_assert!(r.checked_mul(r).unwrap() <= n);
            prop_assert!((r + 1).checked_mul(r + 1).is_none_or(|v| v > n));
        }

        #[test]
        fn mul_never_panics(a in any::<i64>(), b in any::<i64>()) {
            let _ = mul(a, b);
            let _ = div(a, b);
        }
    }
}
