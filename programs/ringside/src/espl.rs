//! Ephemeral SPL Token CPI helpers (eATA create/delegate) and PDA derivations.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use anchor_spl::token::Token;

pub const EPHEMERAL_SPL_TOKEN_PROGRAM_ID: Pubkey = pubkey!("SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2");
pub const DELEGATION_PROGRAM_ID: Pubkey = pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
pub const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

pub fn ephemeral_ata_pda(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), mint.as_ref()], &EPHEMERAL_SPL_TOKEN_PROGRAM_ID).0
}

pub fn associated_token_pda(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), Token::id().as_ref(), mint.as_ref()], &ASSOCIATED_TOKEN_PROGRAM_ID).0
}

pub fn eata_buffer_address(delegated: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"buffer", delegated.as_ref()], &EPHEMERAL_SPL_TOKEN_PROGRAM_ID).0
}

pub fn record_pda(delegated: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"delegation", delegated.as_ref()], &DELEGATION_PROGRAM_ID).0
}

pub fn metadata_pda(delegated: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"delegation-metadata", delegated.as_ref()], &DELEGATION_PROGRAM_ID).0
}

/// `InitializeEphemeralAta` (discriminator 0): creates the eATA for `owner`/`mint`.
pub fn init_ephemeral_ata<'info>(
    espl: &AccountInfo<'info>,
    eata: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    let ix = Instruction {
        program_id: EPHEMERAL_SPL_TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(eata.key(), false),
            AccountMeta::new(payer.key(), true),
            AccountMeta::new_readonly(owner.key(), false),
            AccountMeta::new_readonly(mint.key(), false),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data: vec![0],
    };
    invoke(&ix, &[eata.clone(), payer.clone(), owner.clone(), mint.clone(), system_program.clone(), espl.clone()])?;
    Ok(())
}

/// `DelegateEphemeralAta` (discriminator 4) pinned to `validator`.
#[allow(clippy::too_many_arguments)]
pub fn delegate_ephemeral_ata<'info>(
    espl: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    eata: &AccountInfo<'info>,
    buffer: &AccountInfo<'info>,
    record: &AccountInfo<'info>,
    metadata: &AccountInfo<'info>,
    delegation_program: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    validator: Option<Pubkey>,
) -> Result<()> {
    let mut data = vec![4];
    if let Some(v) = validator {
        data.extend_from_slice(v.as_ref());
    }
    let ix = Instruction {
        program_id: EPHEMERAL_SPL_TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(payer.key(), true),
            AccountMeta::new(eata.key(), false),
            AccountMeta::new_readonly(EPHEMERAL_SPL_TOKEN_PROGRAM_ID, false),
            AccountMeta::new(buffer.key(), false),
            AccountMeta::new(record.key(), false),
            AccountMeta::new(metadata.key(), false),
            AccountMeta::new_readonly(delegation_program.key(), false),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };
    invoke(
        &ix,
        &[
            payer.clone(),
            eata.clone(),
            espl.clone(),
            buffer.clone(),
            record.clone(),
            metadata.clone(),
            delegation_program.clone(),
            system_program.clone(),
        ],
    )?;
    Ok(())
}
