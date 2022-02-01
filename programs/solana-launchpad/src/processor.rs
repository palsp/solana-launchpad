use crate::{account::*, context::*, error::*};
use anchor_lang::solana_program::program_pack::IsInitialized;
use anchor_spl::token::{self, Burn, CloseAccount, MintTo, Transfer};

use anchor_lang::prelude::*;

pub struct Processor {}

impl Processor {
  pub fn initialize_pool_token(
    ctx: Context<InitializePool>,
    ido_name: String,
    bumps: PoolBumps,
    private_target_investment: u64,
    num_ido_tokens_public: u64,
    num_ido_tokens_private: u64,
    ido_times: IdoTimes,
    merkle_root: Option<[u8; 32]>,
  ) -> ProgramResult {
    let ido_account = &mut ctx.accounts.ido_account;

    let name_bytes = ido_name.as_bytes();
    let mut name_data = [b' '; 10];
    name_data[..name_bytes.len()].copy_from_slice(name_bytes);

    ido_account.ido_name = name_data;
    ido_account.bumps = bumps;
    ido_account.ido_authority = ctx.accounts.ido_authority.key();

    ido_account.redeemable_mint = ctx.accounts.redeemable_mint.key();
    ido_account.watermelon_mint = ctx.accounts.watermelon_mint.key();

    ido_account.pool_watermelon = ctx.accounts.pool_watermelon.key();
    ido_account.num_ido_tokens_public = num_ido_tokens_public;
    ido_account.num_ido_tokens_private = num_ido_tokens_private;
    ido_account.private_target_investment = private_target_investment;
    // Only for pool token
    ido_account.pool_usdc = ctx.accounts.pool_usdc.key();
    ido_account.usdc_mint = ctx.accounts.usdc_mint.key();

    ido_account.ido_times = ido_times;

    if let Some(root) = merkle_root {
      ido_account.merkle_root = root;
    }

    // Transfer Watermelon from ido_authority_watermelon to pool account.
    let cpi_accounts = Transfer {
      from: ctx.accounts.ido_authority_watermelon.to_account_info(),
      to: ctx.accounts.pool_watermelon.to_account_info(),
      authority: ctx.accounts.ido_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    let total_ido_tokens = (num_ido_tokens_public as u128)
      .checked_add(num_ido_tokens_private as u128)
      .unwrap();
    token::transfer(cpi_ctx, total_ido_tokens as u64)?;

    Ok(())
  }

  pub fn initialize_pool_native(
    ctx: Context<InitializePoolNative>,
    ido_name: String,
    bumps: PoolBumps,
    private_target_investment: u64,
    num_ido_tokens_public: u64,
    num_ido_tokens_private: u64,
    ido_times: IdoTimes,
  ) -> ProgramResult {
    let ido_account = &mut ctx.accounts.ido_account;

    let name_bytes = ido_name.as_bytes();
    let mut name_data = [b' '; 10];
    name_data[..name_bytes.len()].copy_from_slice(name_bytes);

    ido_account.ido_name = name_data;
    ido_account.bumps = bumps;
    ido_account.ido_authority = ctx.accounts.ido_authority.key();

    ido_account.redeemable_mint = ctx.accounts.redeemable_mint.key();
    ido_account.watermelon_mint = ctx.accounts.watermelon_mint.key();

    ido_account.pool_watermelon = ctx.accounts.pool_watermelon.key();
    ido_account.num_ido_tokens_public = num_ido_tokens_public;
    ido_account.num_ido_tokens_private = num_ido_tokens_private;
    ido_account.private_target_investment = private_target_investment;
    // Only for pool native
    ido_account.pool_native = ctx.accounts.pool_native.key();

    ido_account.ido_times = ido_times;

    // Transfer Watermelon from ido_authority_watermelon to pool account.
    let cpi_accounts = Transfer {
      from: ctx.accounts.ido_authority_watermelon.to_account_info(),
      to: ctx.accounts.pool_watermelon.to_account_info(),
      authority: ctx.accounts.ido_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    let total_ido_tokens = (num_ido_tokens_public as u128)
      .checked_add(num_ido_tokens_private as u128)
      .unwrap();
    token::transfer(cpi_ctx, total_ido_tokens as u64)?;

    Ok(())
  }
}
