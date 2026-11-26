use anchor_lang::prelude::*;
use ringside_fixed::model::PARAMS_BYTES;
use ringside_sim::SIM_BYTES;

pub const CONFIG_SEED: &[u8] = b"config";
pub const MODEL_SEED: &[u8] = b"model";
pub const PROFILE_SEED: &[u8] = b"profile";
pub const MATCH_SEED: &[u8] = b"match";
pub const MARKET_SEED: &[u8] = b"market";
pub const POSITION_SEED: &[u8] = b"pos";
pub const RECORD_SEED: &[u8] = b"record";

/// Market modes: the Ringside book is priced inside `tick`; the TV-delay book is fed by a relay.
pub const MODE_LIVE: u8 = 0;
pub const MODE_DELAYED: u8 = 1;

/// Match status.
pub const ST_LOBBY: u8 = 0;
pub const ST_LIVE: u8 = 1;
pub const ST_SUDDEN_DEATH: u8 = 2;
pub const ST_CLOSED: u8 = 3; // fight over, not yet settled
pub const ST_SETTLED: u8 = 4;
pub const ST_DRAW: u8 = 5; // settled as a draw

/// Market status.
pub const MK_OPEN: u8 = 0;
pub const MK_CLOSED: u8 = 1;
pub const MK_SETTLED: u8 = 2;

pub const NO_WAVE: u16 = u16::MAX;

/// Global configuration (base layer, read on the ER).
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub relay_authority: Pubkey,
    /// House vault token account (ATA of this Config PDA), delegated as an eATA.
    pub house_vault: Pubkey,
    pub exposure_cap_per_match: u64,
    pub max_qty: u64,
    pub s_base: u64,
    pub s_vol_bps: u64,
    pub s_time: u64,
    pub k_skew: u64,
    pub fee_bps: u16,
    pub tick_ms: u16,
    pub model_version: u16,
    pub stale_ticks_max: u8,
    /// Minimum ER slots between ticks (time gate, with the wall-clock bound in `tick`).
    pub min_slot_gap: u8,
    /// Quotes stay frozen for this many ticks after a lethal-range hit.
    pub freeze_ticks: u8,
    pub paused: bool,
    pub bump: u8,
}

/// Win-probability model parameters: header + the serialized integer model.
#[account(zero_copy)]
#[repr(C)]
pub struct ModelParams {
    pub metrics_hash: [u8; 32],
    pub authority: Pubkey,
    pub written: u32,
    pub version: u16,
    pub finalized: u8,
    pub bump: u8,
    pub blob: [u8; PARAMS_BYTES],
}
const _: () = assert!(core::mem::size_of::<ModelParams>() == 32 + 32 + 8 + PARAMS_BYTES);

#[account]
#[derive(InitSpace)]
pub struct Profile {
    pub wallet: Pubkey,
    pub total_staked: u64,
    pub elo: u32,
    pub matches: u32,
    pub wins: u32,
    pub bump: u8,
}

/// One duel. Delegated to the TEE validator; public.
#[account(zero_copy)]
#[repr(C)]
pub struct Match {
    pub match_id: u64,
    pub stake: u64,
    pub created_unix: i64,
    pub start_unix: i64,
    pub start_slot: u64,
    pub last_tick_slot: u64,
    /// Wall-clock estimate of the last tick (ER unix seconds × 1000); informational.
    pub last_tick_unix_ms: i64,
    pub end_unix: i64,
    pub input_seq: [u64; 2],
    pub fighters: [Pubkey; 2],
    pub fighter_session_signers: [Pubkey; 2],
    /// Invited opponent (default = open challenge).
    pub opponent: Pubkey,
    pub market_live: Pubkey,
    pub market_delayed: Pubkey,
    pub escrow: Pubkey,
    pub state_hash: [u8; 32],
    pub input_tick: [u32; 2],
    pub inputs: [u16; 2],
    pub status: u8,
    pub winner: u8,
    pub bump: u8,
    pub joined: u8,
    pub vrf_requested_wave: u16,
    pub vrf_fulfilled_wave: u16,
    pub n_vrf: u16,
    pub finalized: u8,
    pub ai_flags: u8,
    pub sim: [u8; SIM_BYTES],
}

/// One order book for one match.
#[account(zero_copy)]
#[repr(C)]
pub struct Market {
    pub match_key: Pubkey,
    pub match_id: u64,
    pub fair_p: i64,
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
    pub house_liability_a: u64,
    pub house_liability_b: u64,
    pub max_exposure_seen: u64,
    pub cap: u64,
    pub volume: u64,
    pub n_trades: u64,
    pub n_rejected_stale: u64,
    pub n_rejected_fighter: u64,
    pub n_rejected_other: u64,
    pub fee_accrued: u64,
    pub frozen_until_tick: u64,
    pub claimed_total: u64,
    pub relay_unix_ms: i64,
    pub n_positions: u32,
    pub delay_ms: u32,
    /// Mid history, ring buffer of the last 11 priced ticks (micro-USDC).
    pub p_hist: [u32; 11],
    pub p_hist_head: u8,
    pub mode: u8,
    pub status: u8,
    pub winner: u8,
    pub bump: u8,
    pub _pad: [u8; 7],
}

/// A spectator's position in one market. Private (PER permission) until reveal.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub shares_a: u64,
    pub shares_b: u64,
    pub cost_basis: i64,
    pub realized: i64,
    pub last_fill_tick: u64,
    pub settled: bool,
    pub revealed: bool,
    pub bump: u8,
}

/// Settlement receipt on the base layer, written by a Magic Action after the final commit.
#[account]
#[derive(InitSpace)]
pub struct MatchRecord {
    pub match_key: Pubkey,
    pub final_hash: [u8; 32],
    pub match_id: u64,
    pub ticks: u64,
    pub volume_live: u64,
    pub volume_delayed: u64,
    pub house_pnl_live: i64,
    pub house_pnl_delayed: i64,
    pub start_unix: i64,
    pub end_unix: i64,
    pub recorded_unix: i64,
    pub winner: u8,
    pub written: bool,
    pub bump: u8,
}

/// Arguments the finalize action writes into the record.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct RecordArgs {
    pub match_id: u64,
    pub final_hash: [u8; 32],
    pub ticks: u64,
    pub volume_live: u64,
    pub volume_delayed: u64,
    pub house_pnl_live: i64,
    pub house_pnl_delayed: i64,
    pub start_unix: i64,
    pub end_unix: i64,
    pub winner: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TradeSide {
    A,
    B,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TradeDir {
    Buy,
    Sell,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct SpreadArgs {
    pub s_base: u64,
    pub s_vol_bps: u64,
    pub s_time: u64,
    pub k_skew: u64,
    pub exposure_cap_per_match: u64,
    pub max_qty: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct ConfigArgs {
    pub fee_bps: u16,
    pub tick_ms: u16,
    pub stale_ticks_max: u8,
    pub min_slot_gap: u8,
    pub freeze_ticks: u8,
    pub relay_authority: Pubkey,
    pub spread: SpreadArgs,
}

#[event]
pub struct TradeEvent {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub tick: u64,
    pub seen_tick: u64,
    pub price: u64,
    pub qty: u64,
    pub side: u8,
    pub dir: u8,
    pub mode: u8,
    pub unix_ms: i64,
}

#[event]
pub struct RejectEvent {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub tick: u64,
    pub seen_tick: u64,
    pub reason: u32,
    pub mode: u8,
}

#[event]
pub struct TickEvent {
    pub match_key: Pubkey,
    pub tick: u64,
    pub flags: u32,
    pub fair_p: i64,
    pub state_hash: [u8; 32],
}

#[event]
pub struct SeedEvent {
    pub match_key: Pubkey,
    pub wave: u16,
    pub apply_at_tick: u32,
    pub seed: [u8; 32],
}

#[event]
pub struct SettleEvent {
    pub match_key: Pubkey,
    pub winner: u8,
    pub ticks: u64,
    pub final_hash: [u8; 32],
}
