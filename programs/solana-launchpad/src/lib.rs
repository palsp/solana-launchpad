use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, CloseAccount, MintTo, Transfer};

declare_id!("HxaDam53rUz8erQXzLxr2y1qTL1U4uJ7cQRMbXwJTG6t");

use access::*;
use account::{IdoTimes, PoolBumps};
use context::*;
use error::*;

mod access;
mod account;
mod context;
mod error;
mod merkle_proof;

#[program]
pub mod solana_launchpad {
    use super::*;

    #[access_control(validate_ido_times(ido_times))]
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        ido_name: String,
        bumps: PoolBumps,
        private_target_investment: u64,
        num_ido_tokens_public: u64,
        num_ido_tokens_private: u64,
        ido_times: IdoTimes,
        merkle_root: Option<[u8; 32]>,
    ) -> ProgramResult {
        msg!("INITIALIZE POOL");
        let ido_account = &mut ctx.accounts.ido_account;

        let name_bytes = ido_name.as_bytes();
        let mut name_data = [b' '; 10];
        name_data[..name_bytes.len()].copy_from_slice(name_bytes);

        ido_account.ido_name = name_data;
        ido_account.bumps = bumps;
        ido_account.ido_authority = ctx.accounts.ido_authority.key();

        ido_account.usdc_mint = ctx.accounts.usdc_mint.key();
        ido_account.redeemable_mint = ctx.accounts.redeemable_mint.key();
        ido_account.watermelon_mint = ctx.accounts.watermelon_mint.key();

        ido_account.pool_usdc = ctx.accounts.pool_usdc.key();
        ido_account.pool_watermelon = ctx.accounts.pool_watermelon.key();

        ido_account.num_ido_tokens_public = num_ido_tokens_public;
        ido_account.num_ido_tokens_private = num_ido_tokens_private;
        ido_account.private_target_investment = private_target_investment;

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

    #[access_control(unrestricted_phase(&ctx.accounts.ido_account))]
    pub fn init_user_redeemable(ctx: Context<InitUserRedeemable>) -> ProgramResult {
        msg!("INIT USER REDEEMABLE");
        Ok(())
    }

    #[access_control(whitelisted_phase(&ctx.accounts.ido_account))]
    pub fn exchange_usdc_for_watermelon(
        ctx: Context<ExchangeUsdcForWaterMelon>,
        proof: Vec<[u8; 32]>,
        amount_out: u64,
    ) -> ProgramResult {
        msg!("EXCHANGE USDC FOR WATERMELON ( WHITELISTED )");

        let ido_account = &ctx.accounts.ido_account;
        only_for_whitelisted(
            proof,
            ido_account.merkle_root,
            ctx.accounts.user_authority.key().as_ref(),
        )?;

        let amount_paid = (amount_out as u128)
            .checked_mul(ido_account.private_target_investment as u128)
            .unwrap()
            .checked_div(ido_account.num_ido_tokens_private as u128)
            .unwrap();

        require!(amount_out > 0, ErrorCode::InvalidAmountOut);
        require!(amount_paid > 0, ErrorCode::InvalidAmountPaid);

        // Transfer user's USDC to pool USDC account
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_usdc.to_account_info(),
            to: ctx.accounts.pool_usdc.to_account_info(),
            authority: ctx.accounts.user_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount_paid as u64)?;

        let ido_name = ido_account.ido_name.as_ref();
        let seeds = &[
            ido_name.trim_ascii_whitespace(),
            &[ido_account.bumps.ido_account],
        ];
        let signer = &[&seeds[..]];
        // Mint Watermelon to user
        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_watermelon.to_account_info(),
            to: ctx.accounts.user_watermelon.to_account_info(),
            authority: ido_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount_out)?;
        Ok(())
    }
}
