use crate::account::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use std::ops::Deref;

const DECIMALS: u8 = 6;

#[derive(Accounts)]
#[instruction(ido_name: String, bumps: PoolBumps)]
pub struct InitializePool<'info> {
  // IDO Authority account
  #[account(mut)]
  pub ido_authority: Signer<'info>,
  // Watermelon Doesn't have to be an ATA because it could be DAO controlled
  #[account(mut,
    constraint = ido_authority_watermelon.owner == *ido_authority.to_account_info().key,
    constraint = ido_authority_watermelon.mint == *watermelon_mint.to_account_info().key
  )]
  pub ido_authority_watermelon: Box<Account<'info, TokenAccount>>,
  // IDO Accounts
  #[account(init,
        seeds = [ido_name.as_bytes()],
        bump = bumps.ido_account,
        payer = ido_authority)]
  pub ido_account: Box<Account<'info, IdoAccount>>,
  // TODO Confirm USDC mint address on mainnet or leave open as an option for other stables
  #[account(constraint = usdc_mint.decimals == DECIMALS)]
  pub usdc_mint: Box<Account<'info, Mint>>,
  #[account(init,
    mint::decimals = DECIMALS,
    mint::authority = ido_account,
    seeds = [ido_name.as_bytes(), b"redeemable_mint".as_ref()],
    bump = bumps.redeemable_mint,
    payer = ido_authority)]
  pub redeemable_mint: Box<Account<'info, Mint>>,
  #[account(constraint = watermelon_mint.key() == ido_authority_watermelon.mint)]
  pub watermelon_mint: Box<Account<'info, Mint>>,
  #[account(init,
    token::mint = watermelon_mint,
    token::authority = ido_account,
    seeds = [ido_name.as_bytes(), b"pool_watermelon"],
    bump = bumps.pool_watermelon,
    payer = ido_authority)]
  pub pool_watermelon: Box<Account<'info, TokenAccount>>,
  #[account(init,
    token::mint = usdc_mint,
    token::authority = ido_account,
    seeds = [ido_name.as_bytes(), b"pool_usdc"],
    bump = bumps.pool_usdc,
    payer = ido_authority)]
  pub pool_usdc: Box<Account<'info, TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitUserRedeemable<'info> {
  // User Accounts
  #[account(mut)]
  pub user_authority: Signer<'info>,
  #[account(init,
        token::mint = redeemable_mint,
        token::authority = ido_account,
        seeds = [user_authority.key().as_ref(),
            ido_account.ido_name.as_ref().trim_ascii_whitespace(),
            b"user_redeemable"],
        bump,
        payer = user_authority)]
  pub user_redeemable: Box<Account<'info, TokenAccount>>,
  // IDO Accounts
  #[account(seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
        bump = ido_account.bumps.ido_account)]
  pub ido_account: Box<Account<'info, IdoAccount>>,
  #[account(seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"redeemable_mint"],
        bump = ido_account.bumps.redeemable_mint)]
  pub redeemable_mint: Box<Account<'info, Mint>>,
  // Programs and Sysvars
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ExchangeUsdcForRedeemable<'info> {
  // User Accounts
  pub user_authority: Signer<'info>,
  // TODO replace these with the ATA constraints when possible
  #[account(mut,
        constraint = user_usdc.owner == user_authority.key(),
        constraint = user_usdc.mint == usdc_mint.key())]
  pub user_usdc: Box<Account<'info, TokenAccount>>,
  #[account(mut,
        seeds = [user_authority.key().as_ref(),
            ido_account.ido_name.as_ref().trim_ascii_whitespace(),
            b"user_redeemable"],
        bump)]
  pub user_redeemable: Box<Account<'info, TokenAccount>>,
  // IDO Accounts
  #[account(seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
        bump = ido_account.bumps.ido_account,
        has_one = usdc_mint)]
  pub ido_account: Box<Account<'info, IdoAccount>>,
  pub usdc_mint: Box<Account<'info, Mint>>,
  #[account(mut,
        seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"redeemable_mint"],
        bump = ido_account.bumps.redeemable_mint)]
  pub redeemable_mint: Box<Account<'info, Mint>>,
  #[account(mut,
        seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"pool_usdc"],
        bump = ido_account.bumps.pool_usdc)]
  pub pool_usdc: Box<Account<'info, TokenAccount>>,
  // Programs and Sysvars
  pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitEscrowUsdc<'info> {
  // User Accounts
  #[account(mut)]
  pub user_authority: Signer<'info>,
  #[account(init,
        token::mint = usdc_mint,
        token::authority = ido_account,
        seeds =  [user_authority.key().as_ref(),
            ido_account.ido_name.as_ref().trim_ascii_whitespace(),
            b"escrow_usdc"],
        bump,
        payer = user_authority)]
  pub escrow_usdc: Box<Account<'info, TokenAccount>>,
  #[account(seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
        bump = ido_account.bumps.ido_account,
        has_one = usdc_mint)]
  pub ido_account: Box<Account<'info, IdoAccount>>,
  pub usdc_mint: Box<Account<'info, Mint>>,
  // Programs and Sysvars
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ExchangeRedeemableForUsdc<'info> {
  // User Accounts
  pub user_authority: Signer<'info>,
  #[account(mut,
        seeds = [user_authority.key().as_ref(),
            ido_account.ido_name.as_ref().trim_ascii_whitespace(),
            b"escrow_usdc"],
        bump)]
  pub escrow_usdc: Box<Account<'info, TokenAccount>>,
  #[account(mut,
        seeds = [user_authority.key().as_ref(),
            ido_account.ido_name.as_ref().trim_ascii_whitespace(),
            b"user_redeemable"],
        bump)]
  pub user_redeemable: Box<Account<'info, TokenAccount>>,
  // IDO Accounts
  #[account(seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
        bump = ido_account.bumps.ido_account,
        has_one = usdc_mint)]
  pub ido_account: Box<Account<'info, IdoAccount>>,
  pub usdc_mint: Box<Account<'info, Mint>>,
  pub watermelon_mint: Box<Account<'info, Mint>>,
  #[account(mut,
        seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"redeemable_mint"],
        bump = ido_account.bumps.redeemable_mint)]
  pub redeemable_mint: Box<Account<'info, Mint>>,
  #[account(mut,
        seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"pool_usdc"],
        bump = ido_account.bumps.pool_usdc)]
  pub pool_usdc: Box<Account<'info, TokenAccount>>,
  // Programs and Sysvars
  pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExchangeRedeemableForWatermelon<'info> {
  // User does not have to sign, this allows anyone to redeem on their behalf
  // and prevents forgotten / leftover redeemable tokens in the IDO pool.
  pub payer: Signer<'info>,
  // User Accounts
  #[account(mut)] // Sol rent from empty redeemable account is refunded to the user
  pub user_authority: AccountInfo<'info>,
  // TODO replace with ATA constraints
  #[account(mut,
        constraint = user_watermelon.owner == user_authority.key(),
        constraint = user_watermelon.mint == watermelon_mint.key())]
  pub user_watermelon: Box<Account<'info, TokenAccount>>,
  #[account(mut,
        seeds = [user_authority.key().as_ref(),
            ido_account.ido_name.as_ref().trim_ascii_whitespace(),
            b"user_redeemable"],
        bump)]
  pub user_redeemable: Box<Account<'info, TokenAccount>>,
  // IDO Accounts
  #[account(seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
        bump = ido_account.bumps.ido_account,
        has_one = watermelon_mint)]
  pub ido_account: Box<Account<'info, IdoAccount>>,
  pub watermelon_mint: Box<Account<'info, Mint>>,
  #[account(mut,
        seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"redeemable_mint"],
        bump = ido_account.bumps.redeemable_mint)]
  pub redeemable_mint: Box<Account<'info, Mint>>,
  #[account(mut,
        seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"pool_watermelon"],
        bump = ido_account.bumps.pool_watermelon)]
  pub pool_watermelon: Box<Account<'info, TokenAccount>>,
  // Programs and Sysvars
  pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawPoolUsdc<'info> {
  // IDO Authority Accounts
  pub ido_authority: Signer<'info>,
  // Doesn't need to be an ATA because it might be a DAO account
  #[account(mut,
        constraint = ido_authority_usdc.owner == ido_authority.key(),
        constraint = ido_authority_usdc.mint == usdc_mint.key())]
  pub ido_authority_usdc: Box<Account<'info, TokenAccount>>,
  // IDO Accounts
  #[account(seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
        bump = ido_account.bumps.ido_account,
        has_one = ido_authority,
        has_one = usdc_mint,
        has_one = watermelon_mint)]
  pub ido_account: Box<Account<'info, IdoAccount>>,
  pub usdc_mint: Box<Account<'info, Mint>>,
  pub watermelon_mint: Box<Account<'info, Mint>>,
  #[account(mut,
        seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"pool_usdc"],
        bump = ido_account.bumps.pool_usdc)]
  pub pool_usdc: Box<Account<'info, TokenAccount>>,
  // Program and Sysvars
  pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawFromEscrow<'info> {
  // User does not have to sign, this allows anyone to redeem on their behalf
  // and prevents forgotten / leftover USDC in the IDO pool.
  pub payer: Signer<'info>,
  // User Accounts
  #[account(mut)]
  pub user_authority: AccountInfo<'info>,
  #[account(mut,
        constraint = user_usdc.owner == user_authority.key(),
        constraint = user_usdc.mint == usdc_mint.key())]
  pub user_usdc: Box<Account<'info, TokenAccount>>,
  #[account(mut,
        seeds = [user_authority.key().as_ref(),
            ido_account.ido_name.as_ref().trim_ascii_whitespace(),
            b"escrow_usdc"],
        bump)]
  pub escrow_usdc: Box<Account<'info, TokenAccount>>,
  // IDO Accounts
  #[account(seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
        bump = ido_account.bumps.ido_account,
        has_one = usdc_mint)]
  pub ido_account: Box<Account<'info, IdoAccount>>,
  pub usdc_mint: Box<Account<'info, Mint>>,
  // Programs and Sysvars
  pub token_program: Program<'info, Token>,
}

/// Trait to allow trimming ascii whitespace from a &[u8].
pub trait TrimAsciiWhitespace {
  /// Trim ascii whitespace (based on `is_ascii_whitespace()`) from the
  /// start and end of a slice.
  fn trim_ascii_whitespace(&self) -> &[u8];
}

impl<T: Deref<Target = [u8]>> TrimAsciiWhitespace for T {
  fn trim_ascii_whitespace(&self) -> &[u8] {
    let from = match self.iter().position(|x| !x.is_ascii_whitespace()) {
      Some(i) => i,
      None => return &self[0..0],
    };
    let to = self.iter().rposition(|x| !x.is_ascii_whitespace()).unwrap();
    &self[from..=to]
  }
}
