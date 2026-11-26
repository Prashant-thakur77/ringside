//! Calibrated logistic win-probability model in integer math.
//!
//! The same code runs onchain (inside `tick`), in WASM (browser replay) and in Python
//! (held-out evaluation of the exact onchain implementation).

use crate::{calibrate, lut_sigmoid, mul, CALIB_LEN, LUT_LEN, ONE};

/// Number of model features.
pub const N_FEATURES: usize = 16;
/// Serialized size of [`ModelParams`]: 3·16·8 + 8 + 1024·4 + 64·4.
pub const PARAMS_BYTES: usize = 3 * N_FEATURES * 8 + 8 + LUT_LEN * 4 + CALIB_LEN * 4;
/// z is clamped to ±Z_LIMIT before the LUT (the LUT covers [−16, 16)).
pub const Z_LIMIT: i64 = 16 * ONE;

/// Model parameters, all Q32.32 except the LUT and calibration table (probabilities ×2^32).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ModelParams {
    pub mean: [i64; N_FEATURES],
    pub inv_scale: [i64; N_FEATURES],
    pub weights: [i64; N_FEATURES],
    pub bias: i64,
    pub lut: [u32; LUT_LEN],
    pub calib: [u32; CALIB_LEN],
}

impl Default for ModelParams {
    fn default() -> Self {
        let mut calib = [0u32; CALIB_LEN];
        for (j, v) in calib.iter_mut().enumerate() {
            *v = ((j as u64 * u32::MAX as u64) / (CALIB_LEN as u64 - 1)) as u32;
        }
        Self {
            mean: [0; N_FEATURES],
            inv_scale: [ONE; N_FEATURES],
            weights: [0; N_FEATURES],
            bias: 0,
            lut: crate::build_sigmoid_lut(),
            calib,
        }
    }
}

/// Errors from model evaluation or decoding.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ModelError {
    Math,
    BadLength,
}

impl ModelParams {
    /// Linear score z (Q32.32), clamped to ±16.
    pub fn score(&self, x: &[i64; N_FEATURES]) -> Result<i64, ModelError> {
        let mut z: i128 = self.bias as i128;
        for i in 0..N_FEATURES {
            let centered = x[i].checked_sub(self.mean[i]).ok_or(ModelError::Math)?;
            let std = mul(centered, self.inv_scale[i]).ok_or(ModelError::Math)?;
            z += (self.weights[i] as i128 * std as i128) >> 32;
        }
        Ok(z.clamp(-(Z_LIMIT as i128), Z_LIMIT as i128) as i64)
    }

    /// Calibrated P(A wins) as a probability ×2^32.
    pub fn predict(&self, x: &[i64; N_FEATURES]) -> Result<u32, ModelError> {
        let z = self.score(x)?;
        let raw = lut_sigmoid(z, &self.lut);
        Ok(calibrate(raw, &self.calib))
    }

    /// Uncalibrated P(A wins) (LUT sigmoid only), probability ×2^32.
    pub fn predict_raw(&self, x: &[i64; N_FEATURES]) -> Result<u32, ModelError> {
        Ok(lut_sigmoid(self.score(x)?, &self.lut))
    }

    /// Little-endian serialization used for the onchain `ModelParams` blob.
    pub fn to_bytes(&self) -> [u8; PARAMS_BYTES] {
        let mut out = [0u8; PARAMS_BYTES];
        let mut o = 0;
        for arr in [&self.mean, &self.inv_scale, &self.weights] {
            for v in arr.iter() {
                out[o..o + 8].copy_from_slice(&v.to_le_bytes());
                o += 8;
            }
        }
        out[o..o + 8].copy_from_slice(&self.bias.to_le_bytes());
        o += 8;
        for v in self.lut.iter() {
            out[o..o + 4].copy_from_slice(&v.to_le_bytes());
            o += 4;
        }
        for v in self.calib.iter() {
            out[o..o + 4].copy_from_slice(&v.to_le_bytes());
            o += 4;
        }
        debug_assert_eq!(o, PARAMS_BYTES);
        out
    }

    /// Inverse of [`ModelParams::to_bytes`].
    pub fn from_bytes(b: &[u8]) -> Result<Self, ModelError> {
        if b.len() != PARAMS_BYTES {
            return Err(ModelError::BadLength);
        }
        let rd8 = |o: usize| i64::from_le_bytes(b[o..o + 8].try_into().unwrap());
        let rd4 = |o: usize| u32::from_le_bytes(b[o..o + 4].try_into().unwrap());
        let mut p = ModelParams {
            mean: [0; N_FEATURES],
            inv_scale: [0; N_FEATURES],
            weights: [0; N_FEATURES],
            bias: 0,
            lut: [0; LUT_LEN],
            calib: [0; CALIB_LEN],
        };
        let mut o = 0;
        for i in 0..N_FEATURES {
            p.mean[i] = rd8(o);
            o += 8;
        }
        for i in 0..N_FEATURES {
            p.inv_scale[i] = rd8(o);
            o += 8;
        }
        for i in 0..N_FEATURES {
            p.weights[i] = rd8(o);
            o += 8;
        }
        p.bias = rd8(o);
        o += 8;
        for i in 0..LUT_LEN {
            p.lut[i] = rd4(o);
            o += 4;
        }
        for i in 0..CALIB_LEN {
            p.calib[i] = rd4(o);
            o += 4;
        }
        Ok(p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn q(x: f64) -> i64 {
        (x * ONE as f64).round() as i64
    }

    fn sample_params(w: &[f64; N_FEATURES], b: f64) -> ModelParams {
        let mut p = ModelParams::default();
        for i in 0..N_FEATURES {
            p.weights[i] = q(w[i]);
            p.mean[i] = q(0.1 * i as f64);
            p.inv_scale[i] = q(1.0 / (1.0 + 0.05 * i as f64));
        }
        p.bias = q(b);
        p
    }

    #[test]
    fn params_size_is_about_4_5kb() {
        assert_eq!(PARAMS_BYTES, 4744);
    }

    #[test]
    fn roundtrip_bytes() {
        let p = sample_params(&[0.3; N_FEATURES], -0.2);
        let b = p.to_bytes();
        assert_eq!(ModelParams::from_bytes(&b).unwrap(), p);
        assert_eq!(ModelParams::from_bytes(&b[1..]), Err(ModelError::BadLength));
    }

    proptest! {
        #[test]
        fn integer_model_matches_float(
            w in proptest::array::uniform16(-2.0f64..2.0),
            x in proptest::array::uniform16(-3.0f64..3.0),
            b in -1.0f64..1.0,
        ) {
            let p = sample_params(&w, b);
            let xi: [i64; N_FEATURES] = core::array::from_fn(|i| q(x[i]));
            let mut z = b;
            for i in 0..N_FEATURES {
                z += w[i] * (x[i] - 0.1 * i as f64) / (1.0 + 0.05 * i as f64);
            }
            let z = z.clamp(-16.0, 16.0);
            let want = 1.0 / (1.0 + (-z).exp());
            let got = p.predict(&xi).unwrap() as f64 / 4294967296.0;
            prop_assert!((got - want).abs() < 1e-4, "got {got} want {want}");
        }
    }
}
