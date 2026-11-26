//! Ringside: a real-time 1v1 duel and an in-play "who wins" book in one ephemeral-rollup state.
//!
//! The game tick and the price live in the same account set on the same validator, so every fill
//! is stamped with the tick it was priced on and stale fills are rejected onchain.

use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransfer};
use ephemeral_rollups_sdk::access_control::instructions::{CreateEphemeralPermissionCpi, UpdateEphemeralPermissionCpi};
use ephemeral_rollups_sdk::access_control::structs::{
    EphemeralMembersArgs, EphemeralPermission, Member, PERMISSION_SEED, TX_BALANCES_FLAG, TX_LOGS_FLAG, TX_MESSAGE_FLAG,
};
use ephemeral_rollups_sdk::anchor::{action, commit, delegate, ephemeral, vrf, vrf_callback};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
#[allow(deprecated)]
use ephemeral_rollups_sdk::crank::{ScheduleCrankCpi, ScheduleTaskArgs};
use ephemeral_rollups_sdk::ephem::{CallHandler, MagicIntentBundleBuilder};
use ephemeral_rollups_sdk::vrf::consts::program_identity_pubkey;
use ephemeral_rollups_sdk::vrf::instructions::{create_request_randomness_ix_const, RequestRandomnessParams};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;
use ephemeral_rollups_sdk::{ActionArgs, ShortAccountMeta};
use ringside_fixed::trade::{self as tm, Dir, Limits, Side, TradeError};
use session_keys::{session_auth_or, Session, SessionError, SessionTokenV2};

pub mod error;
pub mod espl;
pub mod pricing;
pub mod state;

use error::{code, RingsideError};
use espl::*;
use state::*;

declare_id!("4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej");

/// Requester identity for scoped VRF (compile-time constant, SDK 0.18).
pub const VRF_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);
/// Scoped identity the VRF program signs callbacks with, computed at compile time.
pub const VRF_CALLBACK_IDENTITY: Pubkey =
    Pubkey::new_from_array(ephemeral_rollups_sdk::vrf::consts::scoped_vrf_identity_const(&crate::ID).0);
/// Escrow index used by `ActionArgs::new` for post-commit actions.
pub const ACTION_ESCROW_INDEX: u8 = 255;
/// Lamports pre-funded into a Position PDA for its ephemeral permission account (2 members).
pub fn permission_rent() -> u64 {
    ephemeral_rollups_sdk::ephemeral_accounts::rent(EphemeralPermission::size_of(2) as u32)
}
/// Offset of `vrf_seed` inside the canonical sim encoding.
pub const SIM_SEED_OFFSET: usize = 4 + 4 + 2 + 1 + 1 + 2 + 2 + 4;
/// Offset of `wave_index` (u16) inside the canonical sim encoding.
pub const SIM_WAVE_OFFSET: usize = 4 + 4 + 2 + 1 + 1 + 2;

/// Unique crank task id per match: first 8 bytes of sha256(program_id ‖ match_id), positive.
pub fn task_id_for(match_id: u64) -> i64 {
    let h = hashv(&[crate::ID.as_ref(), &match_id.to_le_bytes()[..]]).to_bytes();
    (u64::from_le_bytes(h[..8].try_into().unwrap()) & (i64::MAX as u64)) as i64
}

/// Hash-chain link with the sha256 syscall (bit-identical to `ringside_sim::hash_link`).
pub fn chain(prev: &[u8; 32], tick: u64, state: &[u8]) -> [u8; 32] {
    hashv(&[prev.as_ref(), &tick.to_le_bytes()[..], state]).to_bytes()
}

fn config_seeds(bump: &[u8; 1]) -> [&[u8]; 2] {
    [CONFIG_SEED, bump]
}

fn status_from_phase(phase: u8, winner: u8) -> u8 {
    match phase {
        ringside_sim::PHASE_LIVE => ST_LIVE,
        ringside_sim::PHASE_SUDDEN_DEATH => ST_SUDDEN_DEATH,
        _ => {
            let _ = winner;
            ST_CLOSED
        }
    }
}

fn trade_err(e: TradeError) -> RingsideError {
    match e {
        TradeError::Slippage => RingsideError::ErrSlippage,
        TradeError::Exposure => RingsideError::ErrExposure,
        TradeError::InsufficientShares => RingsideError::ErrInsufficientShares,
        TradeError::ZeroQty | TradeError::MaxQty => RingsideError::ErrBadQty,
        TradeError::Math => RingsideError::ErrMath,
    }
}

fn elo_delta(winner: u32, loser: u32) -> u32 {
    let diff = loser as i64 - winner as i64;
    (16 + diff / 25).clamp(4, 28) as u32
}

#[ephemeral]
#[program]
pub mod ringside {
    use super::*;

    // ───────────────────────────── base layer: setup ─────────────────────────────

    pub fn initialize_config(ctx: Context<InitializeConfig>, args: ConfigArgs) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.usdc_mint = ctx.accounts.usdc_mint.key();
        c.house_vault = associated_token_pda(&c.key(), &c.usdc_mint);
        c.bump = ctx.bumps.config;
        c.model_version = 0;
        c.paused = false;
        apply_config(c, &args);
        Ok(())
    }

    pub fn update_config(ctx: Context<AdminConfig>, args: ConfigArgs) -> Result<()> {
        apply_config(&mut ctx.accounts.config, &args);
        Ok(())
    }

    pub fn set_spread_params(ctx: Context<AdminConfig>, args: SpreadArgs) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.s_base = args.s_base;
        c.s_vol_bps = args.s_vol_bps;
        c.s_time = args.s_time;
        c.k_skew = args.k_skew;
        c.exposure_cap_per_match = args.exposure_cap_per_match;
        c.max_qty = args.max_qty;
        Ok(())
    }

    pub fn pause(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    /// Creates the house vault eATA (owned by the Config PDA) and delegates it to `validator`
    /// (first remaining account).
    pub fn init_house_vault(ctx: Context<InitHouseVault>) -> Result<()> {
        let a = &ctx.accounts;
        let validator = ctx.remaining_accounts.first().map(|v| v.key());
        init_ephemeral_ata(
            &a.ephemeral_token_program.to_account_info(),
            &a.house_eata.to_account_info(),
            &a.admin.to_account_info(),
            &a.config.to_account_info(),
            &a.usdc_mint.to_account_info(),
            &a.system_program.to_account_info(),
        )?;
        delegate_ephemeral_ata(
            &a.ephemeral_token_program.to_account_info(),
            &a.admin.to_account_info(),
            &a.house_eata.to_account_info(),
            &a.eata_buffer.to_account_info(),
            &a.eata_record.to_account_info(),
            &a.eata_metadata.to_account_info(),
            &a.delegation_program.to_account_info(),
            &a.system_program.to_account_info(),
            validator,
        )
    }

    pub fn create_model(ctx: Context<CreateModel>, version: u16) -> Result<()> {
        let mut m = ctx.accounts.model.load_init()?;
        m.version = version;
        m.authority = ctx.accounts.admin.key();
        m.bump = ctx.bumps.model;
        Ok(())
    }

    /// Chunked write of the 4,744-byte model blob (fits the 1,232-byte transaction limit).
    pub fn set_model_params(ctx: Context<SetModel>, version: u16, offset: u32, chunk: Vec<u8>) -> Result<()> {
        let mut m = ctx.accounts.model.load_mut()?;
        require!(m.version == version && m.finalized == 0, RingsideError::ErrModel);
        let start = offset as usize;
        let end = start.checked_add(chunk.len()).ok_or(RingsideError::ErrMath)?;
        require!(end <= m.blob.len(), RingsideError::ErrModel);
        m.blob[start..end].copy_from_slice(&chunk);
        m.written = m.written.max(end as u32);
        Ok(())
    }

    /// Locks the model, stores the held-out metrics hash and makes it the active version.
    pub fn finalize_model(ctx: Context<FinalizeModel>, version: u16, metrics_hash: [u8; 32]) -> Result<()> {
        let mut m = ctx.accounts.model.load_mut()?;
        require!(m.version == version && m.written as usize == m.blob.len(), RingsideError::ErrModel);
        m.finalized = 1;
        m.metrics_hash = metrics_hash;
        ctx.accounts.config.model_version = version;
        Ok(())
    }

    pub fn create_profile(ctx: Context<CreateProfile>) -> Result<()> {
        let p = &mut ctx.accounts.profile;
        p.wallet = ctx.accounts.wallet.key();
        p.elo = 1200;
        p.bump = ctx.bumps.profile;
        Ok(())
    }

    pub fn delegate_profile(ctx: Context<DelegateProfile>) -> Result<()> {
        let validator = ctx.remaining_accounts.first().map(|v| v.key());
        ctx.accounts.delegate_profile(
            &ctx.accounts.payer,
            &[PROFILE_SEED, ctx.accounts.wallet.key().as_ref()],
            DelegateConfig { validator, ..Default::default() },
        )?;
        Ok(())
    }

    /// Creates a match, both books, the base-layer MatchRecord and the escrow eATA.
    pub fn create_match(ctx: Context<CreateMatch>, match_id: u64, stake: u64, opponent: Pubkey, delay_ms: u32) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(!cfg.paused, RingsideError::ErrPaused);
        require!(stake > 0, RingsideError::ErrBadQty);
        require!((500..=8000).contains(&delay_ms), RingsideError::ErrInvalidAccount);
        let now = Clock::get()?.unix_timestamp;
        let game_key = ctx.accounts.game.key();
        {
            let mut g = ctx.accounts.game.load_init()?;
            g.match_id = match_id;
            g.stake = stake;
            g.created_unix = now;
            g.opponent = opponent;
            g.market_live = ctx.accounts.market_live.key();
            g.market_delayed = ctx.accounts.market_delayed.key();
            g.escrow = associated_token_pda(&game_key, &cfg.usdc_mint);
            g.status = ST_LOBBY;
            g.bump = ctx.bumps.game;
            g.vrf_requested_wave = NO_WAVE;
            g.vrf_fulfilled_wave = NO_WAVE;
            g.input_tick = [u32::MAX; 2];
            let s = ringside_sim::SimState::new(cfg.tick_ms, [0u8; 32]);
            ringside_sim::encode_into_slice(&s, &mut g.sim);
        }
        for (loader, mode, bump) in [
            (&ctx.accounts.market_live, MODE_LIVE, ctx.bumps.market_live),
            (&ctx.accounts.market_delayed, MODE_DELAYED, ctx.bumps.market_delayed),
        ] {
            let mut m = loader.load_init()?;
            m.match_key = game_key;
            m.match_id = match_id;
            m.mode = mode;
            m.bump = bump;
            m.cap = cfg.exposure_cap_per_match;
            m.delay_ms = if mode == MODE_DELAYED { delay_ms } else { 0 };
            m.status = MK_OPEN;
            let p_even = 1u32 << 31;
            pricing::requote(&mut m, cfg, p_even, ringside_sim::MATCH_MS as u64, 0, false);
        }
        let r = &mut ctx.accounts.record;
        r.match_key = game_key;
        r.match_id = match_id;
        r.bump = ctx.bumps.record;
        let a = &ctx.accounts;
        init_ephemeral_ata(
            &a.ephemeral_token_program.to_account_info(),
            &a.escrow_eata.to_account_info(),
            &a.creator.to_account_info(),
            &a.game.to_account_info(),
            &a.usdc_mint.to_account_info(),
            &a.system_program.to_account_info(),
        )?;
        Ok(())
    }

    /// Delegates the match and both books to the TEE validator (first remaining account).
    pub fn delegate_match(ctx: Context<DelegateMatch>, match_id: u64) -> Result<()> {
        let validator = ctx.remaining_accounts.first().map(|v| v.key());
        let id = match_id.to_le_bytes();
        let cfg = || DelegateConfig { validator, ..Default::default() };
        ctx.accounts.delegate_game(&ctx.accounts.payer, &[MATCH_SEED, &id], cfg())?;
        ctx.accounts.delegate_market_live(&ctx.accounts.payer, &[MARKET_SEED, &id, &[MODE_LIVE]], cfg())?;
        ctx.accounts.delegate_market_delayed(&ctx.accounts.payer, &[MARKET_SEED, &id, &[MODE_DELAYED]], cfg())?;
        Ok(())
    }

    /// Delegates the match escrow eATA (fighter stakes) to the TEE validator.
    pub fn delegate_escrow(ctx: Context<DelegateEscrow>, _match_id: u64) -> Result<()> {
        let a = &ctx.accounts;
        let validator = ctx.remaining_accounts.first().map(|v| v.key());
        delegate_ephemeral_ata(
            &a.ephemeral_token_program.to_account_info(),
            &a.payer.to_account_info(),
            &a.escrow_eata.to_account_info(),
            &a.eata_buffer.to_account_info(),
            &a.eata_record.to_account_info(),
            &a.eata_metadata.to_account_info(),
            &a.delegation_program.to_account_info(),
            &a.system_program.to_account_info(),
            validator,
        )
    }

    /// Creates a spectator Position for one book, pre-funded for its ephemeral permission.
    pub fn join_position(ctx: Context<JoinPosition>) -> Result<()> {
        let p = &mut ctx.accounts.position;
        p.owner = ctx.accounts.owner.key();
        p.market = ctx.accounts.market.key();
        p.bump = ctx.bumps.position;
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.position.to_account_info(),
                },
            ),
            permission_rent(),
        )?;
        Ok(())
    }

    pub fn delegate_position(ctx: Context<DelegatePosition>) -> Result<()> {
        let validator = ctx.remaining_accounts.first().map(|v| v.key());
        ctx.accounts.delegate_position(
            &ctx.accounts.payer,
            &[POSITION_SEED, ctx.accounts.market.key().as_ref(), ctx.accounts.owner.key().as_ref()],
            DelegateConfig { validator, ..Default::default() },
        )?;
        Ok(())
    }

    /// Base-layer handler for the finalize Magic Action: writes the MatchRecord receipt.
    /// Only reachable through the post-commit path (escrow signer) scheduled by this program.
    pub fn write_match_record(ctx: Context<WriteMatchRecord>, args: RecordArgs) -> Result<()> {
        let r = &mut ctx.accounts.record;
        require!(r.match_id == args.match_id, RingsideError::ErrInvalidAccount);
        if r.written {
            return Ok(());
        }
        r.final_hash = args.final_hash;
        r.ticks = args.ticks;
        r.volume_live = args.volume_live;
        r.volume_delayed = args.volume_delayed;
        r.house_pnl_live = args.house_pnl_live;
        r.house_pnl_delayed = args.house_pnl_delayed;
        r.start_unix = args.start_unix;
        r.end_unix = args.end_unix;
        r.winner = args.winner;
        r.recorded_unix = Clock::get()?.unix_timestamp;
        r.written = true;
        Ok(())
    }

    // ─────────────────────────── ephemeral rollup (TEE) ───────────────────────────

    /// Makes a Position private: only its owner (and the house authority) can read it.
    pub fn init_position_permission(ctx: Context<PositionPermission>) -> Result<()> {
        if ctx.accounts.permission.lamports() > 0 {
            return Ok(());
        }
        let p = &ctx.accounts.position;
        let bump = [p.bump];
        let seeds: [&[u8]; 4] = [POSITION_SEED, p.market.as_ref(), p.owner.as_ref(), &bump];
        CreateEphemeralPermissionCpi {
            payer: ctx.accounts.position.to_account_info(),
            permissioned_account: ctx.accounts.position.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            args: EphemeralMembersArgs { is_private: true, members: position_members(&p.owner, &ctx.accounts.config.key()) },
        }
        .invoke_signed(&[&seeds])?;
        Ok(())
    }

    /// A fighter joins: stake moves from the player's token account to the match escrow.
    /// The second join starts the match.
    #[session_auth_or(ctx.accounts.player.key() == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn join_fight(ctx: Context<JoinFight>, _match_id: u64) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(!cfg.paused, RingsideError::ErrPaused);
        let player = ctx.accounts.player.key();
        let signer = ctx.accounts.signer.key();
        let stake;
        {
            let mut g = ctx.accounts.game.load_mut()?;
            require!(g.status == ST_LOBBY, RingsideError::ErrClosed);
            require!(g.fighters[0] != player && g.fighters[1] != player, RingsideError::ErrMatchFull);
            let slot = if g.joined & 1 == 0 { 0 } else if g.joined & 2 == 0 { 1 } else { return err!(RingsideError::ErrMatchFull) };
            if slot == 1 && g.opponent != Pubkey::default() {
                require_keys_eq!(g.opponent, player, RingsideError::ErrMatchFull);
            }
            g.fighters[slot] = player;
            g.fighter_session_signers[slot] = signer;
            g.joined |= 1 << slot;
            stake = g.stake;
        }
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                SplTransfer {
                    from: ctx.accounts.player_token.to_account_info(),
                    to: ctx.accounts.escrow_token.to_account_info(),
                    authority: ctx.accounts.signer.to_account_info(),
                },
            ),
            stake,
        )?;
        let mut g = ctx.accounts.game.load_mut()?;
        if g.joined == 3 {
            let clock = Clock::get()?;
            g.status = ST_LIVE;
            g.start_slot = clock.slot;
            g.start_unix = clock.unix_timestamp;
            g.last_tick_slot = clock.slot;
            g.last_tick_unix_ms = clock.unix_timestamp.saturating_mul(1000);
            let s = ringside_sim::decode(&g.sim).ok_or(RingsideError::ErrMath)?;
            g.state_hash = chain(&[0u8; 32], 0, &ringside_sim::encode(&s));
        }
        Ok(())
    }

    /// A fighter's latest input. Monotonic sequence, at most one per tick.
    #[session_auth_or(ctx.accounts.player.key() == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    pub fn submit_input(ctx: Context<SubmitInput>, _match_id: u64, seq: u64, input_bits: u16) -> Result<()> {
        let player = ctx.accounts.player.key();
        let mut g = ctx.accounts.game.load_mut()?;
        require!(g.status == ST_LIVE || g.status == ST_SUDDEN_DEATH, RingsideError::ErrClosed);
        let i = if g.fighters[0] == player { 0 } else if g.fighters[1] == player { 1 } else { return err!(RingsideError::ErrNotFighter) };
        let tick = u32::from_le_bytes(g.sim[0..4].try_into().unwrap());
        require!(seq > g.input_seq[i], RingsideError::ErrBadSeq);
        require!(g.input_tick[i] != tick, RingsideError::ErrBadSeq);
        g.input_seq[i] = seq;
        g.input_tick[i] = tick;
        g.inputs[i] = input_bits & 0x0f7f;
        Ok(())
    }

    /// Advances the duel by one fixed step and re-prices the Ringside book in the same
    /// instruction. Permissionless (crank-scheduled), time-gated and idempotent.
    pub fn tick(ctx: Context<Tick>, _match_id: u64) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let clock = Clock::get()?;
        let mut g = ctx.accounts.game.load_mut()?;
        if g.status == ST_CLOSED || g.status == ST_SETTLED || g.status == ST_DRAW {
            return Ok(()); // finished: no-op so the crank can run out harmlessly
        }
        require!(g.status == ST_LIVE || g.status == ST_SUDDEN_DEATH, RingsideError::ErrClosed);
        require!(clock.slot >= g.last_tick_slot.saturating_add(cfg.min_slot_gap as u64), RingsideError::ErrTooEarly);
        let mut s = ringside_sim::decode(&g.sim).ok_or(RingsideError::ErrMath)?;
        // Wall-clock bound: game time can never run ahead of real time by more than one second.
        let elapsed_ms = clock.unix_timestamp.saturating_sub(g.start_unix).saturating_add(1).saturating_mul(1000);
        let next_game_ms = (s.tick as i64 + 1) * s.dt_ms as i64;
        require!(next_game_ms <= elapsed_ms, RingsideError::ErrTooEarly);

        let ev = ringside_sim::step(&mut s, g.inputs);
        let bytes = ringside_sim::encode(&s);
        g.sim.copy_from_slice(&bytes);
        g.state_hash = chain(&g.state_hash, s.tick as u64, &bytes);
        g.last_tick_slot = clock.slot;
        g.last_tick_unix_ms = clock.unix_timestamp.saturating_mul(1000);
        g.status = status_from_phase(s.phase, s.winner);
        let tick = s.tick as u64;

        let mut m = ctx.accounts.market_live.load_mut()?;
        if s.is_over() {
            g.winner = s.winner;
            g.end_unix = clock.unix_timestamp;
            m.status = MK_CLOSED;
            m.winner = s.winner;
            m.last_priced_tick = tick;
        } else {
            let model = ctx.accounts.model.load()?;
            require!(model.finalized == 1 && model.version == cfg.model_version, RingsideError::ErrModel);
            let x = ringside_sim::features(&s);
            let p = pricing::model_p(&model.blob, &x)?;
            pricing::requote(&mut m, cfg, p, s.time_left_ms() as u64, tick, ev.has(ringside_sim::EV_LETHAL));
        }
        emit!(TickEvent { match_key: ctx.accounts.game.key(), tick, inputs: s.last_inputs, flags: ev.flags, fair_p: m.fair_p, state_hash: g.state_hash });
        Ok(())
    }

    /// Requests the VRF seed for the next power-up wave (one request per wave, never per tick).
    pub fn request_wave_randomness(ctx: Context<RequestWave>, match_id: u64) -> Result<()> {
        let (wave, caller_seed) = {
            let mut g = ctx.accounts.game.load_mut()?;
            require!(g.status == ST_LIVE || g.status == ST_SUDDEN_DEATH, RingsideError::ErrClosed);
            let wave = u16::from_le_bytes(g.sim[SIM_WAVE_OFFSET..SIM_WAVE_OFFSET + 2].try_into().unwrap());
            if g.vrf_requested_wave == wave {
                return Ok(()); // already requested for this wave
            }
            g.vrf_requested_wave = wave;
            let seed = hashv(&[&b"ringside-wave"[..], &match_id.to_le_bytes()[..], &wave.to_le_bytes()[..], &g.state_hash[..]]).to_bytes();
            (wave, seed)
        };
        let ix = create_request_randomness_ix_const(
            RequestRandomnessParams {
                payer: ctx.accounts.payer.key(),
                oracle_queue: ctx.accounts.oracle_queue.key(),
                callback_program_id: crate::ID,
                callback_discriminator: instruction::VrfCallback::DISCRIMINATOR.to_vec(),
                caller_seed,
                accounts_metas: Some(vec![SerializableAccountMeta { pubkey: ctx.accounts.game.key(), is_signer: false, is_writable: true }]),
                callback_args: Some(wave.to_le_bytes().to_vec()),
                ..Default::default()
            },
            VRF_IDENTITY,
        );
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    /// VRF fulfilment: writes the wave seed into the sim state. Bound to the pending request
    /// and idempotent.
    pub fn vrf_callback(ctx: Context<VrfCallback>, randomness: [u8; 32], wave: u16) -> Result<()> {
        let mut g = ctx.accounts.game.load_mut()?;
        require!(g.vrf_requested_wave == wave, RingsideError::ErrBadQueue);
        if g.vrf_fulfilled_wave == wave {
            return Ok(());
        }
        g.sim[SIM_SEED_OFFSET..SIM_SEED_OFFSET + 32].copy_from_slice(&randomness);
        g.vrf_fulfilled_wave = wave;
        g.n_vrf = g.n_vrf.saturating_add(1);
        let tick = u32::from_le_bytes(g.sim[0..4].try_into().unwrap());
        emit!(SeedEvent { match_key: ctx.accounts.game.key(), wave, apply_at_tick: tick.wrapping_add(1), seed: randomness });
        Ok(())
    }

    /// Spectator trade against the house. Rejects stale ticks and fighters onchain.
    /// With `record_rejects`, a stale/fighter/frozen rejection is counted onchain and the
    /// transaction succeeds without a fill; otherwise it fails with the error.
    #[session_auth_or(ctx.accounts.trader.key() == ctx.accounts.signer.key(), SessionError::InvalidToken)]
    #[allow(clippy::too_many_arguments)]
    pub fn trade(
        ctx: Context<Trade>,
        _match_id: u64,
        seen_tick: u64,
        side: TradeSide,
        dir: TradeDir,
        qty: u64,
        limit_price: u64,
        record_rejects: bool,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(!cfg.paused, RingsideError::ErrPaused);
        let trader = ctx.accounts.trader.key();
        let signer = ctx.accounts.signer.key();
        let market_key = ctx.accounts.market.key();
        let unix_ms = Clock::get()?.unix_timestamp.saturating_mul(1000);
        let (live, barred) = {
            let g = ctx.accounts.game.load()?;
            let live = g.status == ST_LIVE || g.status == ST_SUDDEN_DEATH;
            let barred = g.fighters.iter().chain(g.fighter_session_signers.iter()).any(|k| *k != Pubkey::default() && (*k == trader || *k == signer));
            (live, barred)
        };
        let mut m = ctx.accounts.market.load_mut()?;
        require!(live && m.status == MK_OPEN, RingsideError::ErrClosed);
        let tick_now = m.last_priced_tick;
        let reject = if barred {
            Some(RingsideError::ErrFighterBarred)
        } else if ringside_fixed::quote::is_stale(m.last_priced_tick, seen_tick, cfg.stale_ticks_max as u64) {
            Some(RingsideError::ErrStaleTick)
        } else if tick_now < m.frozen_until_tick {
            Some(RingsideError::ErrFrozen)
        } else {
            None
        };
        if let Some(e) = reject {
            if record_rejects {
                match e {
                    RingsideError::ErrFighterBarred => m.n_rejected_fighter += 1,
                    RingsideError::ErrStaleTick => m.n_rejected_stale += 1,
                    _ => m.n_rejected_other += 1,
                }
                emit!(RejectEvent { market: market_key, trader, tick: tick_now, seen_tick, reason: code(e), mode: m.mode });
                return Ok(());
            }
            return Err(e.into());
        }

        let quotes = ringside_fixed::quote::Quotes { mid: m.mid, bid_a: m.bid_a, ask_a: m.ask_a, bid_b: m.bid_b, ask_b: m.ask_b, spread: m.spread };
        let mut book = pricing::book_of(&m);
        let pos_acc = &mut ctx.accounts.position;
        require_keys_eq!(pos_acc.owner, trader, RingsideError::ErrUnauthorized);
        let mut pos = pricing::pos_of(pos_acc);
        let side_m = if side == TradeSide::A { Side::A } else { Side::B };
        let dir_m = if dir == TradeDir::Buy { Dir::Buy } else { Dir::Sell };
        let fill = tm::execute(&mut book, &mut pos, &quotes, side_m, dir_m, qty, limit_price, &Limits { cap: m.cap, max_qty: cfg.max_qty })
            .map_err(trade_err)?;
        pricing::store_book(&mut m, &book);
        pos_acc.shares_a = pos.shares_a;
        pos_acc.shares_b = pos.shares_b;
        pos_acc.cost_basis = pos.cost_basis;
        pos_acc.realized = pos.realized;
        pos_acc.last_fill_tick = tick_now;
        let mode = m.mode;
        drop(m);

        if fill.user_pays {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    SplTransfer {
                        from: ctx.accounts.trader_token.to_account_info(),
                        to: ctx.accounts.house_token.to_account_info(),
                        authority: ctx.accounts.signer.to_account_info(),
                    },
                ),
                fill.cash,
            )?;
        } else {
            let bump = [cfg.bump];
            let seeds = config_seeds(&bump);
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    SplTransfer {
                        from: ctx.accounts.house_token.to_account_info(),
                        to: ctx.accounts.trader_token.to_account_info(),
                        authority: ctx.accounts.config.to_account_info(),
                    },
                    &[&seeds],
                ),
                fill.cash,
            )?;
        }
        emit!(TradeEvent {
            market: market_key,
            trader,
            tick: tick_now,
            seen_tick,
            price: fill.price,
            qty,
            side: side as u8,
            dir: dir as u8,
            mode,
            unix_ms,
        });
        Ok(())
    }

    /// TV-delay baseline: the relay posts features that are `delay_ms` old into the Delayed
    /// book. Same pricing code as `tick`, different (late) feed.
    pub fn relay_delayed_state(
        ctx: Context<RelayDelayed>,
        _match_id: u64,
        tick: u64,
        features: [i64; 16],
        time_left_ms: u32,
        lethal: bool,
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require_keys_eq!(ctx.accounts.relay.key(), cfg.relay_authority, RingsideError::ErrUnauthorized);
        let mut m = ctx.accounts.market_delayed.load_mut()?;
        require!(m.mode == MODE_DELAYED, RingsideError::ErrWrongMode);
        require!(m.status == MK_OPEN, RingsideError::ErrClosed);
        require!(tick > m.last_priced_tick, RingsideError::ErrBadSeq);
        let model = ctx.accounts.model.load()?;
        require!(model.finalized == 1 && model.version == cfg.model_version, RingsideError::ErrModel);
        let p = pricing::model_p(&model.blob, &features)?;
        pricing::requote(&mut m, cfg, p, time_left_ms as u64, tick, lethal);
        m.relay_unix_ms = Clock::get()?.unix_timestamp.saturating_mul(1000);
        Ok(())
    }

    /// Pays the fighters from escrow, closes both books and reveals any positions passed as
    /// (position, permission) pairs in the remaining accounts. Permissionless and idempotent;
    /// a no-op while the fight is still running (so the crank can call it every tick).
    pub fn settle<'info>(ctx: Context<'info, Settle<'info>>, match_id: u64) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let game_key = ctx.accounts.game.key();
        let (status, winner, stake, fighters, bump) = {
            let g = ctx.accounts.game.load()?;
            (g.status, g.winner, g.stake, g.fighters, g.bump)
        };
        if status == ST_LOBBY || status == ST_LIVE || status == ST_SUDDEN_DEATH {
            return Ok(());
        }
        if status == ST_CLOSED {
            require_keys_eq!(ctx.accounts.fighter_a_token.owner, fighters[0], RingsideError::ErrInvalidAccount);
            require_keys_eq!(ctx.accounts.fighter_b_token.owner, fighters[1], RingsideError::ErrInvalidAccount);
            let id = match_id.to_le_bytes();
            let b = [bump];
            let seeds: [&[u8]; 3] = [MATCH_SEED, &id, &b];
            let pay = |to: &Account<'info, TokenAccount>, amount: u64| -> Result<()> {
                if amount == 0 {
                    return Ok(());
                }
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        SplTransfer {
                            from: ctx.accounts.escrow_token.to_account_info(),
                            to: to.to_account_info(),
                            authority: ctx.accounts.game.to_account_info(),
                        },
                        &[&seeds],
                    ),
                    amount,
                )
            };
            let mut new_status = ST_SETTLED;
            let mut fee = 0;
            match winner {
                ringside_sim::WINNER_A | ringside_sim::WINNER_B => {
                    let (payout, f) = tm::fighter_payout(stake, cfg.fee_bps as u64).map_err(trade_err)?;
                    fee = f;
                    let (w, l) = if winner == ringside_sim::WINNER_A { (0, 1) } else { (1, 0) };
                    pay(if w == 0 { &ctx.accounts.fighter_a_token } else { &ctx.accounts.fighter_b_token }, payout)?;
                    pay(&ctx.accounts.house_token, fee)?;
                    let profiles = [&mut ctx.accounts.profile_a, &mut ctx.accounts.profile_b];
                    let (rw, rl) = (profiles[w].elo, profiles[l].elo);
                    let d = elo_delta(rw, rl);
                    let _ = profiles;
                    for (i, p) in [&mut ctx.accounts.profile_a, &mut ctx.accounts.profile_b].into_iter().enumerate() {
                        p.matches = p.matches.saturating_add(1);
                        p.total_staked = p.total_staked.saturating_add(stake);
                        if i == w {
                            p.wins = p.wins.saturating_add(1);
                            p.elo = p.elo.saturating_add(d);
                        } else {
                            p.elo = p.elo.saturating_sub(d).max(100);
                        }
                    }
                    let _ = l;
                }
                _ => {
                    new_status = ST_DRAW;
                    pay(&ctx.accounts.fighter_a_token, stake)?;
                    pay(&ctx.accounts.fighter_b_token, stake)?;
                    for p in [&mut ctx.accounts.profile_a, &mut ctx.accounts.profile_b] {
                        p.matches = p.matches.saturating_add(1);
                        p.total_staked = p.total_staked.saturating_add(stake);
                    }
                }
            }
            {
                let mut g = ctx.accounts.game.load_mut()?;
                g.status = new_status;
                emit!(SettleEvent { match_key: game_key, winner: g.winner, ticks: u32::from_le_bytes(g.sim[0..4].try_into().unwrap()) as u64, final_hash: g.state_hash });
            }
            for (loader, is_live) in [(&ctx.accounts.market_live, true), (&ctx.accounts.market_delayed, false)] {
                let mut m = loader.load_mut()?;
                m.status = MK_SETTLED;
                m.winner = winner;
                if is_live {
                    m.fee_accrued = m.fee_accrued.saturating_add(fee);
                }
            }
        }
        reveal_batch(ctx.remaining_accounts, &ctx.accounts.config.key(), &ctx.accounts.permission_program, &ctx.accounts.ephemeral_vault, &ctx.accounts.magic_program)
    }

    /// Reveals more positions after settle, in batches of (position, permission) pairs.
    pub fn reveal_positions<'info>(ctx: Context<'info, RevealPositions<'info>>, _match_id: u64) -> Result<()> {
        let g = ctx.accounts.game.load()?;
        require!(g.status == ST_SETTLED || g.status == ST_DRAW, RingsideError::ErrNotSettled);
        drop(g);
        reveal_batch(ctx.remaining_accounts, &ctx.accounts.config.key(), &ctx.accounts.permission_program, &ctx.accounts.ephemeral_vault, &ctx.accounts.magic_program)
    }

    /// Pays a settled position: winning shares 1 USDC each, a draw refunds net cost.
    /// Idempotent; anyone may trigger it and funds only go to the owner's token account.
    pub fn claim(ctx: Context<Claim>, _match_id: u64) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let mut m = ctx.accounts.market.load_mut()?;
        require!(m.status == MK_SETTLED, RingsideError::ErrNotSettled);
        let pos = &mut ctx.accounts.position;
        if pos.settled {
            return Ok(());
        }
        require_keys_eq!(ctx.accounts.owner_token.owner, pos.owner, RingsideError::ErrInvalidAccount);
        let outcome = match m.winner {
            ringside_sim::WINNER_A => tm::Outcome::A,
            ringside_sim::WINNER_B => tm::Outcome::B,
            _ => tm::Outcome::Draw,
        };
        let amount = tm::claim_amount(&pricing::pos_of(pos), outcome).map_err(trade_err)?;
        pos.settled = true;
        pos.realized = pos.realized.saturating_add(amount as i64);
        m.claimed_total = m.claimed_total.saturating_add(amount);
        drop(m);
        if amount > 0 {
            let bump = [cfg.bump];
            let seeds = config_seeds(&bump);
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    SplTransfer {
                        from: ctx.accounts.house_token.to_account_info(),
                        to: ctx.accounts.owner_token.to_account_info(),
                        authority: ctx.accounts.config.to_account_info(),
                    },
                    &[&seeds],
                ),
                amount,
            )?;
        }
        Ok(())
    }

    /// Commits the final match and book state to Solana and schedules the MatchRecord receipt
    /// as a post-commit Magic Action. `finalized` counts attempts.
    pub fn finalize(ctx: Context<Finalize>, match_id: u64) -> Result<()> {
        let args = {
            let mut g = ctx.accounts.game.load_mut()?;
            require!(g.status == ST_SETTLED || g.status == ST_DRAW, RingsideError::ErrNotSettled);
            // Re-running is allowed: Magic Actions are not atomic with the commit, so the indexer
            // calls finalize again if the MatchRecord did not land. The L1 handler is idempotent.
            g.finalized = g.finalized.saturating_add(1);
            let ml = ctx.accounts.market_live.load()?;
            let md = ctx.accounts.market_delayed.load()?;
            let pnl = |m: &Market| -> i64 {
                let paid = match m.winner {
                    ringside_sim::WINNER_A => m.inv_a.saturating_mul(ringside_fixed::quote::PAYOUT) as i64,
                    ringside_sim::WINNER_B => m.inv_b.saturating_mul(ringside_fixed::quote::PAYOUT) as i64,
                    _ => m.house_cash.max(0),
                };
                m.house_cash.saturating_sub(paid)
            };
            RecordArgs {
                match_id,
                final_hash: g.state_hash,
                ticks: u32::from_le_bytes(g.sim[0..4].try_into().unwrap()) as u64,
                volume_live: ml.volume,
                volume_delayed: md.volume,
                house_pnl_live: pnl(&ml),
                house_pnl_delayed: pnl(&md),
                start_unix: g.start_unix,
                end_unix: g.end_unix,
                winner: g.winner,
            }
        };
        let data = anchor_lang::InstructionData::data(&crate::instruction::WriteMatchRecord { args });
        let action = CallHandler {
            destination_program: crate::ID,
            accounts: vec![ShortAccountMeta { pubkey: ctx.accounts.record.key().to_bytes().into(), is_writable: true }],
            args: ActionArgs::new(data),
            escrow_authority: ctx.accounts.payer.to_account_info(),
            compute_units: 120_000,
        };
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        // A commit of the 1,232-byte match plus an action does not fit one committor transaction,
        // so the receipt action rides on the live book's commit and the match is committed in its
        // own intent (`commit_match`, sent in the same transaction by the finalizer). The delayed
        // book is committed by `cleanup_positions`. The record args carry both books' numbers
        // and the final hash.
        .commit(&[ctx.accounts.market_live.to_account_info()])
        .add_post_commit_actions([action])
        .build_and_invoke()?;
        Ok(())
    }

    /// Commits the final match state (sim, hash chain head, result) to Solana. Permissionless
    /// after settlement; used by the finalizer right after `finalize`.
    pub fn commit_match(ctx: Context<CommitMatch>, _match_id: u64) -> Result<()> {
        {
            let g = ctx.accounts.game.load()?;
            require!(g.status == ST_SETTLED || g.status == ST_DRAW, RingsideError::ErrNotSettled);
        }
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.game.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    /// Cleanup crank: commits and undelegates settled positions (remaining accounts) in a batch.
    pub fn cleanup_positions<'info>(ctx: Context<'info, Cleanup<'info>>, _match_id: u64) -> Result<()> {
        {
            let g = ctx.accounts.game.load()?;
            require!(g.status == ST_SETTLED || g.status == ST_DRAW, RingsideError::ErrNotSettled);
        }
        let mut batch = Vec::with_capacity(ctx.remaining_accounts.len());
        for acc in ctx.remaining_accounts.iter() {
            if *acc.key == ctx.accounts.market_delayed.key() {
                batch.push(acc.clone()); // the delayed book's final state, committed here
                continue;
            }
            let p: Account<Position> = Account::try_from(acc)?;
            require!(p.settled, RingsideError::ErrNotSettled);
            batch.push(acc.clone());
        }
        if batch.is_empty() {
            return Ok(());
        }
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&batch)
        .build_and_invoke()?;
        Ok(())
    }

    /// Schedules the match crank on the ER: each iteration runs `tick` then `settle` (a no-op
    /// until the fight ends). The task id is derived from hash(program_id ‖ match_id) and the
    /// scheduled instructions carry no signer accounts.
    #[allow(deprecated)]
    pub fn schedule_tick<'info>(ctx: Context<'info, ScheduleTick<'info>>, match_id: u64, interval_ms: i64, iterations: i64) -> Result<()> {
        let a = &ctx.accounts;
        let tick_ix = Instruction {
            program_id: crate::ID,
            accounts: vec![
                AccountMeta::new_readonly(a.config.key(), false),
                AccountMeta::new_readonly(a.model.key(), false),
                AccountMeta::new(a.game.key(), false),
                AccountMeta::new(a.market_live.key(), false),
            ],
            data: anchor_lang::InstructionData::data(&crate::instruction::Tick { _match_id: match_id }),
        };
        let settle_ix = Instruction {
            program_id: crate::ID,
            accounts: vec![
                AccountMeta::new_readonly(a.config.key(), false),
                AccountMeta::new(a.game.key(), false),
                AccountMeta::new(a.market_live.key(), false),
                AccountMeta::new(a.market_delayed.key(), false),
                AccountMeta::new(a.escrow_token.key(), false),
                AccountMeta::new(a.fighter_a_token.key(), false),
                AccountMeta::new(a.fighter_b_token.key(), false),
                AccountMeta::new(a.house_token.key(), false),
                AccountMeta::new(a.profile_a.key(), false),
                AccountMeta::new(a.profile_b.key(), false),
                AccountMeta::new_readonly(a.token_program.key(), false),
                AccountMeta::new_readonly(PERMISSION_PROGRAM_ID, false),
                AccountMeta::new(EPHEMERAL_VAULT_ID, false),
                AccountMeta::new_readonly(MAGIC_PROGRAM_ID, false),
            ],
            data: anchor_lang::InstructionData::data(&crate::instruction::Settle { match_id }),
        };
        ScheduleCrankCpi {
            payer: &ctx.accounts.payer,
            magic_program: &&ctx.accounts.magic_program,
            instruction_accounts: &[
                a.payer.to_account_info(),
                a.program.to_account_info(),
                a.config.to_account_info(),
                a.model.to_account_info(),
                a.game.to_account_info(),
                a.market_live.to_account_info(),
                a.market_delayed.to_account_info(),
                a.escrow_token.to_account_info(),
                a.fighter_a_token.to_account_info(),
                a.fighter_b_token.to_account_info(),
                a.house_token.to_account_info(),
                a.profile_a.to_account_info(),
                a.profile_b.to_account_info(),
                a.token_program.to_account_info(),
                a.permission_program.to_account_info(),
                a.ephemeral_vault.to_account_info(),
            ],
            args: ScheduleTaskArgs {
                task_id: task_id_for(match_id),
                execution_interval_millis: interval_ms,
                iterations,
                instructions: vec![tick_ix, settle_ix],
            },
        }
        .invoke()?;
        Ok(())
    }

    /// Admin moves house liquidity into the house vault on the ER.
    pub fn topup_house_vault(ctx: Context<TopupHouse>, amount: u64) -> Result<()> {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                SplTransfer {
                    from: ctx.accounts.admin_token.to_account_info(),
                    to: ctx.accounts.house_token.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(),
                },
            ),
            amount,
        )
    }

    /// Admin withdraws a match's accrued fighter fees from the house vault.
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, _match_id: u64) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let mut m = ctx.accounts.market_live.load_mut()?;
        let amount = m.fee_accrued;
        m.fee_accrued = 0;
        drop(m);
        if amount == 0 {
            return Ok(());
        }
        let bump = [cfg.bump];
        let seeds = config_seeds(&bump);
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                SplTransfer {
                    from: ctx.accounts.house_token.to_account_info(),
                    to: ctx.accounts.admin_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[&seeds],
            ),
            amount,
        )
    }
}

fn apply_config(c: &mut Config, a: &ConfigArgs) {
    c.fee_bps = a.fee_bps;
    c.tick_ms = a.tick_ms;
    c.stale_ticks_max = a.stale_ticks_max;
    c.min_slot_gap = a.min_slot_gap;
    c.freeze_ticks = a.freeze_ticks;
    c.relay_authority = a.relay_authority;
    c.s_base = a.spread.s_base;
    c.s_vol_bps = a.spread.s_vol_bps;
    c.s_time = a.spread.s_time;
    c.k_skew = a.spread.k_skew;
    c.exposure_cap_per_match = a.spread.exposure_cap_per_match;
    c.max_qty = a.spread.max_qty;
}

fn position_members(owner: &Pubkey, house: &Pubkey) -> Vec<Member> {
    vec![
        Member { flags: TX_LOGS_FLAG | TX_MESSAGE_FLAG | TX_BALANCES_FLAG, pubkey: *owner },
        Member { flags: TX_LOGS_FLAG | TX_MESSAGE_FLAG | TX_BALANCES_FLAG, pubkey: *house },
    ]
}

/// Flips (position, permission) pairs to public. The member list is resent in full so the
/// authority never locks itself out.
fn reveal_batch<'info>(
    pairs: &'info [AccountInfo<'info>],
    house: &Pubkey,
    permission_program: &UncheckedAccount<'info>,
    vault: &UncheckedAccount<'info>,
    magic: &UncheckedAccount<'info>,
) -> Result<()> {
    require!(pairs.len() % 2 == 0, RingsideError::ErrInvalidAccount);
    for pair in pairs.chunks(2) {
        let (pos_info, perm_info) = (&pair[0], &pair[1]);
        let mut pos: Account<Position> = Account::try_from(pos_info)?;
        if pos.revealed {
            continue;
        }
        let expected_perm = Pubkey::find_program_address(&[PERMISSION_SEED, pos_info.key.as_ref()], &PERMISSION_PROGRAM_ID).0;
        require_keys_eq!(*perm_info.key, expected_perm, RingsideError::ErrInvalidAccount);
        let bump = [pos.bump];
        let seeds: [&[u8]; 4] = [POSITION_SEED, pos.market.as_ref(), pos.owner.as_ref(), &bump];
        UpdateEphemeralPermissionCpi {
            payer: pos_info.clone(),
            permissioned_account: pos_info.clone(),
            permission: perm_info.clone(),
            vault: vault.to_account_info(),
            magic_program: magic.to_account_info(),
            permission_program: permission_program.to_account_info(),
            authority: pos_info.clone(),
            authority_is_signer: false,
            args: EphemeralMembersArgs { is_private: false, members: position_members(&pos.owner, house) },
        }
        .invoke_signed(&[&seeds])?;
        pos.revealed = true;
        pos.exit(&crate::ID)?;
    }
    Ok(())
}

// ─────────────────────────────── account contexts ───────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub usdc_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RingsideError::ErrUnauthorized)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct InitHouseVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RingsideError::ErrUnauthorized, has_one = usdc_mint)]
    pub config: Account<'info, Config>,
    pub usdc_mint: Account<'info, Mint>,
    /// CHECK: created and delegated by the Ephemeral SPL Token program.
    #[account(mut, address = ephemeral_ata_pda(&config.key(), &usdc_mint.key()) @ RingsideError::ErrInvalidAccount)]
    pub house_eata: UncheckedAccount<'info>,
    /// CHECK: delegation buffer.
    #[account(mut, address = eata_buffer_address(&house_eata.key()) @ RingsideError::ErrInvalidAccount)]
    pub eata_buffer: UncheckedAccount<'info>,
    /// CHECK: delegation record.
    #[account(mut, address = record_pda(&house_eata.key()) @ RingsideError::ErrInvalidAccount)]
    pub eata_record: UncheckedAccount<'info>,
    /// CHECK: delegation metadata.
    #[account(mut, address = metadata_pda(&house_eata.key()) @ RingsideError::ErrInvalidAccount)]
    pub eata_metadata: UncheckedAccount<'info>,
    /// CHECK: fixed program id.
    #[account(address = EPHEMERAL_SPL_TOKEN_PROGRAM_ID)]
    pub ephemeral_token_program: UncheckedAccount<'info>,
    /// CHECK: fixed program id.
    #[account(address = DELEGATION_PROGRAM_ID)]
    pub delegation_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(version: u16)]
pub struct CreateModel<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RingsideError::ErrUnauthorized)]
    pub config: Account<'info, Config>,
    #[account(init, payer = admin, space = 8 + core::mem::size_of::<ModelParams>(), seeds = [MODEL_SEED, &version.to_le_bytes()], bump)]
    pub model: AccountLoader<'info, ModelParams>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(version: u16)]
pub struct SetModel<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RingsideError::ErrUnauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [MODEL_SEED, &version.to_le_bytes()], bump)]
    pub model: AccountLoader<'info, ModelParams>,
}

#[derive(Accounts)]
#[instruction(version: u16)]
pub struct FinalizeModel<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RingsideError::ErrUnauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [MODEL_SEED, &version.to_le_bytes()], bump)]
    pub model: AccountLoader<'info, ModelParams>,
}

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the wallet the profile belongs to.
    pub wallet: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, space = 8 + Profile::INIT_SPACE, seeds = [PROFILE_SEED, wallet.key().as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateProfile<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: profile owner.
    pub wallet: UncheckedAccount<'info>,
    /// CHECK: delegated PDA.
    #[account(mut, del, seeds = [PROFILE_SEED, wallet.key().as_ref()], bump)]
    pub profile: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct CreateMatch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint)]
    pub config: Box<Account<'info, Config>>,
    #[account(init, payer = creator, space = 8 + core::mem::size_of::<Match>(), seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
    #[account(init, payer = creator, space = 8 + core::mem::size_of::<Market>(), seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_LIVE]], bump)]
    pub market_live: AccountLoader<'info, Market>,
    #[account(init, payer = creator, space = 8 + core::mem::size_of::<Market>(), seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_DELAYED]], bump)]
    pub market_delayed: AccountLoader<'info, Market>,
    #[account(init, payer = creator, space = 8 + MatchRecord::INIT_SPACE, seeds = [RECORD_SEED, &match_id.to_le_bytes()], bump)]
    pub record: Box<Account<'info, MatchRecord>>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    /// CHECK: escrow eATA (owner = match PDA), created by the Ephemeral SPL Token program.
    #[account(mut, address = ephemeral_ata_pda(&game.key(), &usdc_mint.key()) @ RingsideError::ErrInvalidAccount)]
    pub escrow_eata: UncheckedAccount<'info>,
    /// CHECK: fixed program id.
    #[account(address = EPHEMERAL_SPL_TOKEN_PROGRAM_ID)]
    pub ephemeral_token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct DelegateMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: match PDA.
    #[account(mut, del, seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: UncheckedAccount<'info>,
    /// CHECK: live market PDA.
    #[account(mut, del, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_LIVE]], bump)]
    pub market_live: UncheckedAccount<'info>,
    /// CHECK: delayed market PDA.
    #[account(mut, del, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_DELAYED]], bump)]
    pub market_delayed: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct DelegateEscrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: match PDA (owner of the escrow eATA).
    #[account(seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: UncheckedAccount<'info>,
    /// CHECK: escrow eATA.
    #[account(mut, address = ephemeral_ata_pda(&game.key(), &config.usdc_mint) @ RingsideError::ErrInvalidAccount)]
    pub escrow_eata: UncheckedAccount<'info>,
    /// CHECK: delegation buffer.
    #[account(mut, address = eata_buffer_address(&escrow_eata.key()) @ RingsideError::ErrInvalidAccount)]
    pub eata_buffer: UncheckedAccount<'info>,
    /// CHECK: delegation record.
    #[account(mut, address = record_pda(&escrow_eata.key()) @ RingsideError::ErrInvalidAccount)]
    pub eata_record: UncheckedAccount<'info>,
    /// CHECK: delegation metadata.
    #[account(mut, address = metadata_pda(&escrow_eata.key()) @ RingsideError::ErrInvalidAccount)]
    pub eata_metadata: UncheckedAccount<'info>,
    /// CHECK: fixed program id.
    #[account(address = EPHEMERAL_SPL_TOKEN_PROGRAM_ID)]
    pub ephemeral_token_program: UncheckedAccount<'info>,
    /// CHECK: fixed program id.
    #[account(address = DELEGATION_PROGRAM_ID)]
    pub delegation_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinPosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the spectator wallet.
    pub owner: UncheckedAccount<'info>,
    /// CHECK: a Market PDA (owned by this program or, once delegated, by the delegation program).
    pub market: UncheckedAccount<'info>,
    #[account(init, payer = payer, space = 8 + Position::INIT_SPACE, seeds = [POSITION_SEED, market.key().as_ref(), owner.key().as_ref()], bump)]
    pub position: Account<'info, Position>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: spectator wallet.
    pub owner: UncheckedAccount<'info>,
    /// CHECK: market PDA.
    pub market: UncheckedAccount<'info>,
    /// CHECK: delegated position PDA.
    #[account(mut, del, seeds = [POSITION_SEED, market.key().as_ref(), owner.key().as_ref()], bump)]
    pub position: UncheckedAccount<'info>,
}

#[action]
#[derive(Accounts)]
#[instruction(args: RecordArgs)]
pub struct WriteMatchRecord<'info> {
    #[account(mut, seeds = [RECORD_SEED, &args.match_id.to_le_bytes()], bump = record.bump)]
    pub record: Account<'info, MatchRecord>,
    /// CHECK: the program that scheduled the action must be Ringside itself.
    #[account(address = crate::ID @ RingsideError::ErrUnauthorized)]
    pub source_program: UncheckedAccount<'info>,
    /// CHECK: escrow authority the action was scheduled with.
    pub escrow_auth: UncheckedAccount<'info>,
    /// CHECK: only the delegation program can sign for this PDA (post-commit path).
    #[account(
        signer @ RingsideError::ErrUnauthorized,
        address = ephemeral_rollups_sdk::pda::ephemeral_balance_pda_from_payer(&escrow_auth.key(), ACTION_ESCROW_INDEX) @ RingsideError::ErrUnauthorized,
    )]
    pub escrow: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct PositionPermission<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [POSITION_SEED, position.market.as_ref(), position.owner.as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,
    /// CHECK: verified by the permission program.
    #[account(mut, seeds = [PERMISSION_SEED, position.key().as_ref()], bump, seeds::program = PERMISSION_PROGRAM_ID)]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: permission program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts, Session)]
#[instruction(match_id: u64)]
pub struct JoinFight<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    /// CHECK: the fighter wallet (session authority).
    pub player: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
    #[account(mut, constraint = player_token.owner == player.key() @ RingsideError::ErrInvalidAccount, constraint = player_token.mint == config.usdc_mint @ RingsideError::ErrInvalidAccount)]
    pub player_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = associated_token_pda(&game.key(), &config.usdc_mint) @ RingsideError::ErrInvalidAccount)]
    pub escrow_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    #[session(signer = signer, authority = player.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
}

#[derive(Accounts, Session)]
#[instruction(match_id: u64)]
pub struct SubmitInput<'info> {
    pub signer: Signer<'info>,
    /// CHECK: fighter wallet (session authority).
    pub player: UncheckedAccount<'info>,
    #[account(mut, seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
    #[session(signer = signer, authority = player.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct Tick<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [MODEL_SEED, &config.model_version.to_le_bytes()], bump)]
    pub model: AccountLoader<'info, ModelParams>,
    #[account(mut, seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
    #[account(mut, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_LIVE]], bump)]
    pub market_live: AccountLoader<'info, Market>,
}

#[vrf]
#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct RequestWave<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
    /// CHECK: the delegated (ephemeral) queue, or the base queue under the base-layer fallback.
    #[account(
        mut,
        constraint = oracle_queue.key() == ephemeral_rollups_sdk::vrf::consts::DEFAULT_EPHEMERAL_QUEUE
            || oracle_queue.key() == ephemeral_rollups_sdk::vrf::consts::DEFAULT_QUEUE
            || oracle_queue.key() == ephemeral_rollups_sdk::vrf::consts::DEFAULT_EPHEMERAL_TEST_QUEUE
            || oracle_queue.key() == ephemeral_rollups_sdk::vrf::consts::DEFAULT_TEST_QUEUE
            @ RingsideError::ErrBadQueue
    )]
    pub oracle_queue: UncheckedAccount<'info>,
}

/// The scoped VRF identity must sign. Declared here (instead of letting `#[vrf_callback]` inject
/// it) so the address is the compile-time constant `VRF_CALLBACK_IDENTITY`: the injected constraint evaluates
/// the PDA derivation at runtime and exhausts the callback's compute budget. Same check, same key.
#[vrf_callback]
#[derive(Accounts)]
pub struct VrfCallback<'info> {
    #[account(address = VRF_CALLBACK_IDENTITY @ RingsideError::ErrBadQueue)]
    pub vrf_program_identity: Signer<'info>,
    #[account(mut)]
    pub game: AccountLoader<'info, Match>,
}

#[derive(Accounts, Session)]
#[instruction(match_id: u64)]
pub struct Trade<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    /// CHECK: trader wallet (session authority).
    pub trader: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
    #[account(mut, constraint = market.load()?.match_id == match_id @ RingsideError::ErrInvalidAccount)]
    pub market: AccountLoader<'info, Market>,
    #[account(mut, seeds = [POSITION_SEED, market.key().as_ref(), trader.key().as_ref()], bump = position.bump)]
    pub position: Box<Account<'info, Position>>,
    #[account(mut, constraint = trader_token.owner == trader.key() @ RingsideError::ErrInvalidAccount, constraint = trader_token.mint == config.usdc_mint @ RingsideError::ErrInvalidAccount)]
    pub trader_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.house_vault @ RingsideError::ErrInvalidAccount)]
    pub house_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    #[session(signer = signer, authority = trader.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct RelayDelayed<'info> {
    pub relay: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [MODEL_SEED, &config.model_version.to_le_bytes()], bump)]
    pub model: AccountLoader<'info, ModelParams>,
    #[account(mut, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_DELAYED]], bump)]
    pub market_delayed: AccountLoader<'info, Market>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct Settle<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
    #[account(mut, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_LIVE]], bump)]
    pub market_live: AccountLoader<'info, Market>,
    #[account(mut, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_DELAYED]], bump)]
    pub market_delayed: AccountLoader<'info, Market>,
    #[account(mut, address = associated_token_pda(&game.key(), &config.usdc_mint) @ RingsideError::ErrInvalidAccount)]
    pub escrow_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = fighter_a_token.mint == config.usdc_mint @ RingsideError::ErrInvalidAccount)]
    pub fighter_a_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = fighter_b_token.mint == config.usdc_mint @ RingsideError::ErrInvalidAccount)]
    pub fighter_b_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.house_vault @ RingsideError::ErrInvalidAccount)]
    pub house_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [PROFILE_SEED, fighter_a_token.owner.as_ref()], bump = profile_a.bump)]
    pub profile_a: Box<Account<'info, Profile>>,
    #[account(mut, seeds = [PROFILE_SEED, fighter_b_token.owner.as_ref()], bump = profile_b.bump)]
    pub profile_b: Box<Account<'info, Profile>>,
    pub token_program: Program<'info, Token>,
    /// CHECK: permission program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct RevealPositions<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
    /// CHECK: permission program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct Claim<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, constraint = market.load()?.match_id == match_id @ RingsideError::ErrInvalidAccount)]
    pub market: AccountLoader<'info, Market>,
    #[account(mut, seeds = [POSITION_SEED, market.key().as_ref(), position.owner.as_ref()], bump = position.bump)]
    pub position: Box<Account<'info, Position>>,
    #[account(mut, constraint = owner_token.mint == config.usdc_mint @ RingsideError::ErrInvalidAccount)]
    pub owner_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.house_vault @ RingsideError::ErrInvalidAccount)]
    pub house_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[commit]
#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct Finalize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
    #[account(mut, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_LIVE]], bump)]
    pub market_live: AccountLoader<'info, Market>,
    #[account(mut, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_DELAYED]], bump)]
    pub market_delayed: AccountLoader<'info, Market>,
    /// CHECK: base-layer MatchRecord PDA (writable inside the action).
    #[account(seeds = [RECORD_SEED, &match_id.to_le_bytes()], bump)]
    pub record: UncheckedAccount<'info>,
    /// CHECK: destination program of the action.
    #[account(address = crate::ID)]
    pub program_id: UncheckedAccount<'info>,
}

#[commit]
#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct CommitMatch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
}

#[commit]
#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct Cleanup<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: AccountLoader<'info, Match>,
    /// CHECK: the delayed book PDA (may be passed in the batch to commit it).
    #[account(seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_DELAYED]], bump)]
    pub market_delayed: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct ScheduleTick<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: magic program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
    /// CHECK: this program (target of the scheduled instructions).
    #[account(address = crate::ID)]
    pub program: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: active model PDA.
    #[account(seeds = [MODEL_SEED, &config.model_version.to_le_bytes()], bump)]
    pub model: UncheckedAccount<'info>,
    /// CHECK: match PDA (passed through to the scheduled instructions).
    #[account(mut, seeds = [MATCH_SEED, &match_id.to_le_bytes()], bump)]
    pub game: UncheckedAccount<'info>,
    /// CHECK: live market PDA.
    #[account(mut, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_LIVE]], bump)]
    pub market_live: UncheckedAccount<'info>,
    /// CHECK: delayed market PDA.
    #[account(mut, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_DELAYED]], bump)]
    pub market_delayed: UncheckedAccount<'info>,
    /// CHECK: escrow token account (validated by settle).
    #[account(mut, address = associated_token_pda(&game.key(), &config.usdc_mint) @ RingsideError::ErrInvalidAccount)]
    pub escrow_token: UncheckedAccount<'info>,
    /// CHECK: validated by settle.
    #[account(mut)]
    pub fighter_a_token: UncheckedAccount<'info>,
    /// CHECK: validated by settle.
    #[account(mut)]
    pub fighter_b_token: UncheckedAccount<'info>,
    /// CHECK: house vault.
    #[account(mut, address = config.house_vault @ RingsideError::ErrInvalidAccount)]
    pub house_token: UncheckedAccount<'info>,
    /// CHECK: validated by settle.
    #[account(mut)]
    pub profile_a: UncheckedAccount<'info>,
    /// CHECK: validated by settle.
    #[account(mut)]
    pub profile_b: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    /// CHECK: permission program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: ephemeral vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct TopupHouse<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RingsideError::ErrUnauthorized)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, constraint = admin_token.owner == admin.key() @ RingsideError::ErrInvalidAccount)]
    pub admin_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.house_vault @ RingsideError::ErrInvalidAccount)]
    pub house_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct WithdrawFees<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RingsideError::ErrUnauthorized)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [MARKET_SEED, &match_id.to_le_bytes(), &[MODE_LIVE]], bump)]
    pub market_live: AccountLoader<'info, Market>,
    #[account(mut, constraint = admin_token.owner == admin.key() @ RingsideError::ErrInvalidAccount)]
    pub admin_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.house_vault @ RingsideError::ErrInvalidAccount)]
    pub house_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}
