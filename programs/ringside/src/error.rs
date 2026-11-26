use anchor_lang::prelude::*;

#[error_code]
pub enum RingsideError {
    #[msg("Fill priced off a stale tick")]
    ErrStaleTick,
    #[msg("Fighters and their session keys cannot trade their own match")]
    ErrFighterBarred,
    #[msg("Price is worse than the limit")]
    ErrSlippage,
    #[msg("House exposure cap would be exceeded")]
    ErrExposure,
    #[msg("Market or match is not open")]
    ErrClosed,
    #[msg("Signer is not a fighter in this match")]
    ErrNotFighter,
    #[msg("Input sequence must increase and inputs are limited to one per tick")]
    ErrBadSeq,
    #[msg("Too early: time gate not reached")]
    ErrTooEarly,
    #[msg("Wrong VRF queue or request")]
    ErrBadQueue,
    #[msg("Paused")]
    ErrPaused,
    #[msg("Arithmetic error")]
    ErrMath,
    #[msg("Already settled")]
    ErrAlreadySettled,
    #[msg("Quotes are frozen after a lethal-range hit")]
    ErrFrozen,
    #[msg("Not enough shares to sell")]
    ErrInsufficientShares,
    #[msg("Quantity is zero or above the per-trade maximum")]
    ErrBadQty,
    #[msg("Unauthorized")]
    ErrUnauthorized,
    #[msg("Invalid account")]
    ErrInvalidAccount,
    #[msg("Match is full or the opponent is reserved")]
    ErrMatchFull,
    #[msg("Model is not finalized or has a bad layout")]
    ErrModel,
    #[msg("Not settled yet")]
    ErrNotSettled,
    #[msg("Wrong market mode for this instruction")]
    ErrWrongMode,
}

/// Rejection reason codes carried in `RejectEvent` (the Anchor error offset is 6000).
pub fn code(e: RingsideError) -> u32 {
    6000 + e as u32
}
