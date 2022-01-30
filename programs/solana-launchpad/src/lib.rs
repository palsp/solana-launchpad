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
        num_ido_tokens: u64,
        ido_times: IdoTimes,
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

        ido_account.num_ido_tokens = num_ido_tokens;
        ido_account.ido_times = ido_times;

        // Transfer Watermelon from ido_authority to pool account.
        let cpi_accounts = Transfer {
            from: ctx.accounts.ido_authority_watermelon.to_account_info(),
            to: ctx.accounts.pool_watermelon.to_account_info(),
            authority: ctx.accounts.ido_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, num_ido_tokens)?;

        Ok(())
    }

    #[access_control(unrestricted_phase(&ctx.accounts.ido_account))]
    pub fn init_user_redeemable(ctx: Context<InitUserRedeemable>) -> ProgramResult {
        msg!("INIT USER REDEEMABLE");
        Ok(())
    }

    pub fn set_pool_merkle_root(
        ctx: Context<SetPoolMerkleRoot>,
        merkle_root: [u8; 32],
    ) -> ProgramResult {
        ctx.accounts.ido_account.merkle_root = merkle_root;
        Ok(())
    }
    #[access_control(unrestricted_phase(&ctx.accounts.ido_account))]
    pub fn exchange_usdc_for_redeemable(
        ctx: Context<ExchangeUsdcForRedeemable>,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> ProgramResult {
        only_for_whitelisted(
            proof,
            ctx.accounts.ido_account.merkle_root,
            ctx.accounts.user_authority.key().as_ref(),
        )?;

        if ctx.accounts.user_usdc.amount < amount {
            return Err(ErrorCode::LowUsdc.into());
        }
        // Transfer user's USDC to pool USDC account.
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_usdc.to_account_info(),
            to: ctx.accounts.pool_usdc.to_account_info(),
            authority: ctx.accounts.user_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Mint Redeemable to user Redeemable account.
        let ido_name = ctx.accounts.ido_account.ido_name.as_ref();
        let seeds = &[
            ido_name.trim_ascii_whitespace(),
            &[ctx.accounts.ido_account.bumps.ido_account],
        ];
        let signer = &[&seeds[..]];
        let cpi_accounts = MintTo {
            mint: ctx.accounts.redeemable_mint.to_account_info(),
            to: ctx.accounts.user_redeemable.to_account_info(),
            authority: ctx.accounts.ido_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::mint_to(cpi_ctx, amount)?;
        Ok(())
    }

    #[access_control(withdraw_phase(&ctx.accounts.ido_account))]
    pub fn init_escrow_usdc(ctx: Context<InitEscrowUsdc>) -> ProgramResult {
        msg!("INIT ESCROW USDC");
        Ok(())
    }

    #[access_control(withdraw_phase(&ctx.accounts.ido_account))]
    pub fn exchange_redeemable_for_usdc(
        ctx: Context<ExchangeRedeemableForUsdc>,
        amount: u64,
    ) -> ProgramResult {
        msg!("EXCHANGE REDEEMABLE FOR USDC");
        // While token::burn will check this, we prefer a verbose err msg.
        if ctx.accounts.user_redeemable.amount < amount {
            return Err(ErrorCode::LowRedeemable.into());
        }

        let ido_name = ctx.accounts.ido_account.ido_name.as_ref();
        let seeds = &[
            ido_name.trim_ascii_whitespace(),
            &[ctx.accounts.ido_account.bumps.ido_account],
        ];
        let signer = &[&seeds[..]];

        // Burn the user's redeemable tokens.
        let cpi_accounts = Burn {
            mint: ctx.accounts.redeemable_mint.to_account_info(),
            to: ctx.accounts.user_redeemable.to_account_info(),
            authority: ctx.accounts.ido_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::burn(cpi_ctx, amount)?;

        // Transfer USDC from pool account to the user's escrow account.
        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_usdc.to_account_info(),
            to: ctx.accounts.escrow_usdc.to_account_info(),
            authority: ctx.accounts.ido_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }

    #[access_control(ido_over(&ctx.accounts.ido_account))]
    pub fn exchange_redeemable_for_watermelon(
        ctx: Context<ExchangeRedeemableForWatermelon>,
        amount: u64,
    ) -> ProgramResult {
        msg!("EXCHANGE REDEEMABLE FOR WATERMELON");
        // While token::burn will check this, we prefer a verbose err msg.
        if ctx.accounts.user_redeemable.amount < amount {
            return Err(ErrorCode::LowRedeemable.into());
        }

        // Calculate watermelon tokens due.
        let watermelon_amount = (amount as u128)
            .checked_mul(ctx.accounts.pool_watermelon.amount as u128)
            .unwrap()
            .checked_div(ctx.accounts.redeemable_mint.supply as u128)
            .unwrap();

        let ido_name = ctx.accounts.ido_account.ido_name.as_ref();
        let seeds = &[
            ido_name.trim_ascii_whitespace(),
            &[ctx.accounts.ido_account.bumps.ido_account],
        ];
        let signer = &[&seeds[..]];

        // Burn the user's redeemable tokens.
        let cpi_accounts = Burn {
            mint: ctx.accounts.redeemable_mint.to_account_info(),
            to: ctx.accounts.user_redeemable.to_account_info(),
            authority: ctx.accounts.ido_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::burn(cpi_ctx, amount)?;

        // Transfer Watermelon from pool account to user.
        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_watermelon.to_account_info(),
            to: ctx.accounts.user_watermelon.to_account_info(),
            authority: ctx.accounts.ido_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, watermelon_amount as u64)?;

        // Send rent back to user if account is empty
        ctx.accounts.user_redeemable.reload()?;
        if ctx.accounts.user_redeemable.amount == 0 {
            let cpi_accounts = CloseAccount {
                account: ctx.accounts.user_redeemable.to_account_info(),
                destination: ctx.accounts.user_authority.clone(),
                authority: ctx.accounts.ido_account.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::close_account(cpi_ctx)?;
        }
        Ok(())
    }

    #[access_control(ido_over(&ctx.accounts.ido_account))]
    pub fn withdraw_pool_usdc(ctx: Context<WithdrawPoolUsdc>) -> ProgramResult {
        msg!("WITHDRAW POOL USDC");
        // Transfer total USDC from pool to ido_authority account.
        let ido_name = ctx.accounts.ido_account.ido_name.as_ref();

        let seeds = &[
            ido_name.trim_ascii_whitespace(),
            &[ctx.accounts.ido_account.bumps.ido_account],
        ];

        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_usdc.to_account_info(),
            to: ctx.accounts.ido_authority_usdc.to_account_info(),
            authority: ctx.accounts.ido_account.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, ctx.accounts.pool_usdc.amount)?;

        Ok(())
    }

    #[access_control(escrow_over(&ctx.accounts.ido_account))]
    pub fn withdraw_from_escrow(ctx: Context<WithdrawFromEscrow>, amount: u64) -> ProgramResult {
        msg!("WITHDRAW FROM ESCROW");
        // While token::transfer will check this, we prefer a verbose err msg.
        if ctx.accounts.escrow_usdc.amount < amount {
            return Err(ErrorCode::LowUsdc.into());
        }

        let ido_name = ctx.accounts.ido_account.ido_name.as_ref();
        let seeds = &[
            ido_name.trim_ascii_whitespace(),
            &[ctx.accounts.ido_account.bumps.ido_account],
        ];
        let signer = &[&seeds[..]];
        // Transfer USDC from user's escrow account to user's USDC account.
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_usdc.to_account_info(),
            to: ctx.accounts.user_usdc.to_account_info(),
            authority: ctx.accounts.ido_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        // Send rent back to user if account is empty
        ctx.accounts.escrow_usdc.reload()?;
        if ctx.accounts.escrow_usdc.amount == 0 {
            let cpi_accounts = CloseAccount {
                account: ctx.accounts.escrow_usdc.to_account_info(),
                destination: ctx.accounts.user_authority.clone(),
                authority: ctx.accounts.ido_account.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::close_account(cpi_ctx)?;
        }

        Ok(())
    }
}
