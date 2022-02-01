use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::IsInitialized;
use anchor_spl::token::{self, Burn, CloseAccount, MintTo, Transfer};

declare_id!("HxaDam53rUz8erQXzLxr2y1qTL1U4uJ7cQRMbXwJTG6t");

use access::*;
use account::{IdoTimes, PoolBumps};
use context::*;
use error::*;
use processor::Processor;

mod access;
mod account;
mod context;
mod error;
mod merkle_proof;
mod processor;

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
        Processor::initialize_pool_token(
            ctx,
            ido_name,
            bumps,
            private_target_investment,
            num_ido_tokens_public,
            num_ido_tokens_private,
            ido_times,
            merkle_root,
        )
    }

    #[access_control(validate_ido_times(ido_times))]
    pub fn initialize_pool_native(
        ctx: Context<InitializePoolNative>,
        ido_name: String,
        bumps: PoolBumps,
        private_target_investment: u64,
        num_ido_tokens_public: u64,
        num_ido_tokens_private: u64,
        ido_times: IdoTimes,
    ) -> ProgramResult {
        msg!("INITIALIZE POOL NATIVE");
        Processor::initialize_pool_native(
            ctx,
            ido_name,
            bumps,
            private_target_investment,
            num_ido_tokens_public,
            num_ido_tokens_private,
            ido_times,
        )
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

    #[access_control(deposit_phase(&ctx.accounts.ido_account))]
    pub fn exchange_usdc_for_redeemable(
        ctx: Context<ExchangeUsdcForRedeemable>,
        amount_in: u64,
    ) -> ProgramResult {
        msg!("EXCHANGE USDC FOR REDEEMABLE");
        require!(
            ctx.accounts.user_usdc.amount >= amount_in,
            ErrorCode::LowUsdc
        );
        let ido_account = &ctx.accounts.ido_account;

        msg!("TRANSFER USDC TO POOL");
        // Transfer usdc to pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_usdc.to_account_info(),
            to: ctx.accounts.pool_usdc.to_account_info(),
            authority: ctx.accounts.user_authority.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount_in)?;

        msg!("MINT REDEEMABLE TO USER");
        // Mint redeemable to user
        let ido_name = ido_account.ido_name.as_ref();
        let seeds = &[
            ido_name.trim_ascii_whitespace(),
            &[ido_account.bumps.ido_account],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.redeemable_mint.to_account_info(),
            to: ctx.accounts.user_redeemable.to_account_info(),
            authority: ido_account.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::mint_to(cpi_ctx, amount_in)?;

        Ok(())
    }

    // #[access_control(deposit_phase(&ctx.accounts.ido_account))]
    pub fn exchange_native_for_redeemable(
        ctx: Context<ExchangeNativeForRedeemable>,
        amount_in: u64,
    ) -> ProgramResult {
        msg!("EXCHANGE NATIVE FOR REDEEMABLE");
        require!(
            ctx.accounts.user_authority.lamports() >= amount_in,
            ErrorCode::LowUsdc
        );

        msg!(
            "TRANSFER {} FROM user_authority account to {} account",
            amount_in,
            ctx.accounts.pool_native.key()
        );
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user_authority.key(),
            &ctx.accounts.pool_native.key(),
            amount_in,
        );

        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user_authority.to_account_info(),
                ctx.accounts.pool_native.clone(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let ido_account = &ctx.accounts.ido_account;

        msg!("MINT REDEEMABLE TO USER");
        // Mint redeemable to user
        let ido_name = ido_account.ido_name.as_ref();
        let seeds = &[
            ido_name.trim_ascii_whitespace(),
            &[ido_account.bumps.ido_account],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.redeemable_mint.to_account_info(),
            to: ctx.accounts.user_redeemable.to_account_info(),
            authority: ido_account.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::mint_to(cpi_ctx, amount_in)?;

        Ok(())
    }

    #[access_control(withdraw_phase(&ctx.accounts.ido_account))]
    pub fn exchange_redeemable_for_watermelon(
        ctx: Context<ExchangeRedeemableForWatermelon>,
        amount_in: u64,
    ) -> ProgramResult {
        msg!("EXCHANGE REDEEMABLE FOR WATERMELON");
        if !ctx.accounts.ido_account.pool_info.is_initialized() {
            ctx.accounts.ido_account.pool_info.is_initialized = true;
            ctx.accounts.ido_account.pool_info.redeemable_minted =
                ctx.accounts.redeemable_mint.supply;
        }

        require!(
            ctx.accounts.user_redeemable.amount >= amount_in,
            ErrorCode::LowRedeemable
        );

        let ido_name = ctx.accounts.ido_account.ido_name.as_ref();
        let seeds = &[
            ido_name.trim_ascii_whitespace(),
            &[ctx.accounts.ido_account.bumps.ido_account],
        ];
        let signer = &[&seeds[..]];

        msg!("BURN REDEEMABLE");
        // Burn Redeemable
        let cpi_accounts = Burn {
            mint: ctx.accounts.redeemable_mint.to_account_info(),
            to: ctx.accounts.user_redeemable.to_account_info(),
            authority: ctx.accounts.ido_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::burn(cpi_ctx, amount_in)?;

        let amount_out = (amount_in as u128)
            .checked_mul(ctx.accounts.ido_account.num_ido_tokens_public as u128)
            .unwrap()
            .checked_div(ctx.accounts.ido_account.pool_info.redeemable_minted as u128)
            .unwrap();

        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_watermelon.to_account_info(),
            to: ctx.accounts.user_watermelon.to_account_info(),
            authority: ctx.accounts.ido_account.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, amount_out as u64)?;

        msg!("SEND RENT BACK TO USER IF EMPTY");
        ctx.accounts.user_redeemable.reload()?;
        if ctx.accounts.user_redeemable.amount == 0 {
            let cpi_accounts = CloseAccount {
                account: ctx.accounts.user_redeemable.to_account_info(),
                destination: ctx.accounts.user_authority.to_account_info(),
                authority: ctx.accounts.ido_account.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::close_account(cpi_ctx)?;
        }

        // Transfer Watermelon To User
        Ok(())
    }

    pub fn withdraw_native(ctx: Context<WithdrawNative>, amount: u64) -> ProgramResult {
        msg!("WITHDRAW NATIVE");

        require!(ctx.accounts.pool_native.lamports() >= amount, ErrorCode::A);
        let ido_name = ctx.accounts.ido_account.ido_name.as_ref();
        let seeds = &[
            ido_name.trim_ascii_whitespace(),
            b"pool_native",
            &[ctx.accounts.ido_account.bumps.pool_native],
        ];
        let signer = &[&seeds[..]];

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.pool_native.key(),
            &ctx.accounts.user_authority.key(),
            amount,
        );

        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                ctx.accounts.pool_native.clone(),
                ctx.accounts.user_authority.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer,
        )?;

        Ok(())
    }

    // pub fn withdraw_usdc(ctx: Context<InitializePool>) -> ProgramResult {
    //     Ok(())
    // }
}
