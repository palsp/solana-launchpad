use anchor_lang::prelude::*;

// cannot use rust-crypto with anchor
// use merkle_proof::{Keccek256, MerkleProof};
mod access;
mod account;
mod error;
mod merkle_proof;

use crate::merkle_proof::MerkleProof;

declare_id!("6xcV8u1dodsopTqchGiBg5MTcscFmJatHkymhbPbKkwP");

#[program]
pub mod solana_launchpad {
    use super::*;
    pub fn initialize_pool(_ctx: Context<Initialize>) -> ProgramResult {
        msg!("INITIALIZE IDO ACCOUNT");
        Ok(())
    }

    pub fn set_proof(ctx: Context<SetProof>, merkle_root: [u8; 32]) -> ProgramResult {
        let ido_account = &mut ctx.accounts.ido_account;

        ido_account.merkle_root = merkle_root;
        Ok(())
    }

    pub fn is_whitelisted(ctx: Context<VerifyProof>, proof: Vec<[u8; 32]>) -> ProgramResult {
        let ido_account = &ctx.accounts.ido_account;
        let leaf = MerkleProof::calc_leaf_hash(ctx.accounts.signer.key().as_ref());

        require!(
            MerkleProof::verify(proof, ido_account.merkle_root, leaf),
            ErrorCode::InvalidProof
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = signer, space = IdoAccount::LEN)]
    pub ido_account: Account<'info, IdoAccount>,
    #[account(mut)]
    pub signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetProof<'info> {
    #[account(mut)]
    pub ido_account: Account<'info, IdoAccount>,
}

#[derive(Accounts)]
pub struct VerifyProof<'info> {
    #[account(mut)]
    pub ido_account: Account<'info, IdoAccount>,

    pub signer: Signer<'info>,
}

#[account]
pub struct IdoAccount {
    merkle_root: [u8; 32],
}

impl IdoAccount {
    const LEN: usize = 8 + 32;
}

#[error]
pub enum ErrorCode {
    #[msg("invalid proof")]
    InvalidProof,
}
