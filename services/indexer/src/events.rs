//! Decoders for Ringside's Anchor events ("Program data: <base64>") and zero-copy accounts.

use base64::Engine;
use sha2::{Digest, Sha256};

pub fn disc(kind: &str, name: &str) -> [u8; 8] {
    let h = Sha256::digest(format!("{kind}:{name}").as_bytes());
    h[..8].try_into().unwrap()
}

pub fn b58(b: &[u8]) -> String {
    bs58::encode(b).into_string()
}

struct R<'a> {
    b: &'a [u8],
    o: usize,
}
impl<'a> R<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let s = self.b.get(self.o..self.o + n)?;
        self.o += n;
        Some(s)
    }
    fn pk(&mut self) -> Option<String> {
        self.take(32).map(b58)
    }
    fn u8(&mut self) -> Option<u8> {
        self.take(1).map(|s| s[0])
    }
    fn u16(&mut self) -> Option<u16> {
        self.take(2).map(|s| u16::from_le_bytes(s.try_into().unwrap()))
    }
    fn u32(&mut self) -> Option<u32> {
        self.take(4).map(|s| u32::from_le_bytes(s.try_into().unwrap()))
    }
    fn u64(&mut self) -> Option<u64> {
        self.take(8).map(|s| u64::from_le_bytes(s.try_into().unwrap()))
    }
    fn i64(&mut self) -> Option<i64> {
        self.take(8).map(|s| i64::from_le_bytes(s.try_into().unwrap()))
    }
    fn h32(&mut self) -> Option<String> {
        self.take(32).map(hex::encode)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    Tick {
        match_key: String,
        tick: u64,
        inputs: [u16; 2],
        flags: u32,
        fair_p: f64,
        state_hash: String,
    },
    Trade {
        market: String,
        trader: String,
        tick: u64,
        game_tick: u64,
        seen_tick: u64,
        price: u64,
        qty: u64,
        side: u8,
        dir: u8,
        mode: u8,
        unix_ms: i64,
    },
    Reject {
        market: String,
        trader: String,
        tick: u64,
        seen_tick: u64,
        reason: u32,
        mode: u8,
    },
    Seed {
        match_key: String,
        wave: u16,
        apply_at_tick: u32,
        seed: String,
    },
    Settle {
        match_key: String,
        winner: u8,
        ticks: u64,
        final_hash: String,
    },
}

pub fn decode(data: &[u8]) -> Option<Event> {
    let (d, rest) = data.split_at(8.min(data.len()));
    let mut r = R { b: rest, o: 0 };
    if d == disc("event", "TickEvent") {
        return Some(Event::Tick {
            match_key: r.pk()?,
            tick: r.u64()?,
            inputs: [r.u16()?, r.u16()?],
            flags: r.u32()?,
            fair_p: r.i64()? as f64 / 4294967296.0,
            state_hash: r.h32()?,
        });
    }
    if d == disc("event", "TradeEvent") {
        return Some(Event::Trade {
            market: r.pk()?,
            trader: r.pk()?,
            tick: r.u64()?,
            game_tick: r.u64()?,
            seen_tick: r.u64()?,
            price: r.u64()?,
            qty: r.u64()?,
            side: r.u8()?,
            dir: r.u8()?,
            mode: r.u8()?,
            unix_ms: r.i64()?,
        });
    }
    if d == disc("event", "RejectEvent") {
        return Some(Event::Reject {
            market: r.pk()?,
            trader: r.pk()?,
            tick: r.u64()?,
            seen_tick: r.u64()?,
            reason: r.u32()?,
            mode: r.u8()?,
        });
    }
    if d == disc("event", "SeedEvent") {
        return Some(Event::Seed {
            match_key: r.pk()?,
            wave: r.u16()?,
            apply_at_tick: r.u32()?,
            seed: r.h32()?,
        });
    }
    if d == disc("event", "SettleEvent") {
        return Some(Event::Settle {
            match_key: r.pk()?,
            winner: r.u8()?,
            ticks: r.u64()?,
            final_hash: r.h32()?,
        });
    }
    None
}

pub fn events_from_logs(logs: &[String]) -> Vec<Event> {
    logs.iter()
        .filter_map(|l| l.strip_prefix("Program data: "))
        .filter_map(|b| base64::engine::general_purpose::STANDARD.decode(b).ok())
        .filter_map(|d| decode(&d))
        .collect()
}

/// Match account view (offsets of the repr(C) layout, after the 8-byte discriminator).
#[derive(Debug, Clone, serde::Serialize)]
pub struct MatchView {
    pub match_id: u64,
    pub stake: u64,
    pub start_unix: i64,
    pub end_unix: i64,
    pub fighters: [String; 2],
    pub market_live: String,
    pub market_delayed: String,
    pub state_hash: String,
    pub status: u8,
    pub winner: u8,
    pub finalized: u8,
    pub tick: u32,
    pub tick_ms: u16,
    pub sim_hex: String,
}

pub fn decode_match(data: &[u8]) -> Option<MatchView> {
    let b = data.get(8..)?;
    if b.len() < 1224 {
        return None;
    }
    let u64a = |o: usize| u64::from_le_bytes(b[o..o + 8].try_into().unwrap());
    let sim = &b[392..392 + 832];
    Some(MatchView {
        match_id: u64a(0),
        stake: u64a(8),
        start_unix: u64a(24) as i64,
        end_unix: u64a(56) as i64,
        fighters: [b58(&b[80..112]), b58(&b[112..144])],
        market_live: b58(&b[240..272]),
        market_delayed: b58(&b[272..304]),
        state_hash: hex::encode(&b[336..368]),
        status: b[380],
        winner: b[381],
        finalized: b[390],
        tick: u32::from_le_bytes(sim[0..4].try_into().unwrap()),
        tick_ms: u16::from_le_bytes(sim[8..10].try_into().unwrap()),
        sim_hex: hex::encode(sim),
    })
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MarketView {
    pub match_key: String,
    pub match_id: u64,
    pub fair_p: f64,
    pub last_priced_tick: u64,
    pub mid: u64,
    pub bid_a: u64,
    pub ask_a: u64,
    pub bid_b: u64,
    pub ask_b: u64,
    pub spread: u64,
    pub inv_a: u64,
    pub inv_b: u64,
    pub house_cash: i64,
    pub max_exposure_seen: u64,
    pub cap: u64,
    pub volume: u64,
    pub n_trades: u64,
    pub n_rejected_stale: u64,
    pub n_rejected_fighter: u64,
    pub n_rejected_other: u64,
    pub frozen_until_tick: u64,
    pub delay_ms: u32,
    pub mode: u8,
    pub status: u8,
    pub winner: u8,
}

pub fn decode_market(data: &[u8]) -> Option<MarketView> {
    let b = data.get(8..)?;
    if b.len() < 296 {
        return None;
    }
    let u = |o: usize| u64::from_le_bytes(b[o..o + 8].try_into().unwrap());
    Some(MarketView {
        match_key: b58(&b[0..32]),
        match_id: u(32),
        fair_p: u(40) as i64 as f64 / 4294967296.0,
        last_priced_tick: u(48),
        mid: u(56),
        bid_a: u(64),
        ask_a: u(72),
        bid_b: u(80),
        ask_b: u(88),
        spread: u(96),
        inv_a: u(104),
        inv_b: u(112),
        house_cash: u(120) as i64,
        max_exposure_seen: u(144),
        cap: u(152),
        volume: u(160),
        n_trades: u(168),
        n_rejected_stale: u(176),
        n_rejected_fighter: u(184),
        n_rejected_other: u(192),
        frozen_until_tick: u(208),
        delay_ms: u32::from_le_bytes(b[236..240].try_into().unwrap()),
        mode: b[285],
        status: b[286],
        winner: b[287],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discriminators_are_anchor_style() {
        // sha256("event:TradeEvent")[..8] is stable; checked against the IDL in CI.
        assert_eq!(disc("event", "TradeEvent").len(), 8);
        assert_ne!(disc("event", "TradeEvent"), disc("event", "TickEvent"));
    }

    #[test]
    fn decodes_a_tick_event() {
        let mut d = disc("event", "TickEvent").to_vec();
        d.extend_from_slice(&[1u8; 32]);
        d.extend_from_slice(&42u64.to_le_bytes());
        d.extend_from_slice(&7u16.to_le_bytes());
        d.extend_from_slice(&9u16.to_le_bytes());
        d.extend_from_slice(&3u32.to_le_bytes());
        d.extend_from_slice(&(1i64 << 31).to_le_bytes());
        d.extend_from_slice(&[2u8; 32]);
        match decode(&d).unwrap() {
            Event::Tick { tick, inputs, fair_p, .. } => {
                assert_eq!(tick, 42);
                assert_eq!(inputs, [7, 9]);
                assert!((fair_p - 0.5).abs() < 1e-12);
            }
            e => panic!("{e:?}"),
        }
    }
}
