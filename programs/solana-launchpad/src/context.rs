use crate::{account::*, error::ErrorCode};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use std::ops::Deref;

const DECIMALS: u8 = 6;
/// Anchor puts your accounts on the stack by default. But, likely, because your accounts are quite big, 
/// or you have a lot of them, you're running of space on the stack.
/// 
/// 
/// To solve this problem, you could try Boxing your account structs, to move them to the heap:
/// https://stackoverflow.com/questions/70747729/how-do-i-avoid-my-anchor-program-throwing-an-access-violation-in-stack-frame




#[derive(Accounts)]
#[instruction(ido_name: String, bumps : PoolBumps)] 
pub struct InitializePool<'info> {
  #[account(mut)]
  pub ido_authority: Signer<'info>,

  #[account(mut,
    constraint = ido_authority_watermelon.owner == ido_authority.key(),
    constraint = ido_authority_watermelon.mint == watermelon_mint.key()
  )]
  pub ido_authority_watermelon: Box<Account<'info, TokenAccount>>, 

  #[account(init, 
    seeds = [ido_name.as_bytes()],
    bump = bumps.ido_account,
    payer = ido_authority
  )]
  pub ido_account: Account<'info, IdoAccount>,


  // #[account(
  //   constraint = usdc_mint.decimals == DECIMALS 
  // )]
  pub usdc_mint : Box<Account<'info,Mint>>,


  #[account(init,
    mint::decimals = DECIMALS,
    mint::authority = ido_account,
    seeds = [ido_name.as_bytes(), b"redeemable_mint".as_ref()],
    bump = bumps.redeemable_mint,
    payer = ido_authority
  )]
  pub redeemable_mint : Box<Account<'info, Mint>>,


  #[account(constraint = watermelon_mint.key() == ido_authority_watermelon.mint)]
  pub watermelon_mint : Box<Account<'info, Mint>>,


  #[account(init,
    token::mint = watermelon_mint,
    token::authority = ido_account,
    seeds = [ido_name.as_bytes(), b"pool_watermelon"],
    bump = bumps.pool_watermelon,
    payer = ido_authority
  )]
  pub pool_watermelon: Account<'info, TokenAccount>,

  #[account(init, 
    token::mint = usdc_mint,
    token::authority = ido_account,
    seeds = [ido_name.as_bytes(), b"pool_usdc"],
    bump = bumps.pool_usdc, 
    payer = ido_authority
  )]
  pub pool_usdc : Account<'info, TokenAccount>,

  pub system_program : Program<'info, System>,

  pub token_program : Program<'info, Token>,

  pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitUserRedeemable<'info> {

  #[account(mut)]
  pub user_authority: Signer<'info>,

  #[account(init,
    token::mint = redeemable_mint,
    token::authority = ido_account,
    seeds = [user_authority.key().as_ref(),
    ido_account.ido_name.as_ref().trim_ascii_whitespace(),
    b"user_redeemable".as_ref()],
    bump,
    payer = user_authority
  )]
  pub user_redeemable: Box<Account<'info, TokenAccount>>,


  #[account(
    seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
    bump = ido_account.bumps.ido_account
  )]
  pub ido_account: Box<Account<'info, IdoAccount>>,

  #[account(
    seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"redeemable_mint".as_ref()],
    bump = ido_account.bumps.redeemable_mint
  )]
  pub redeemable_mint: Box<Account<'info, Mint>>,


  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, Token>,
  pub rent: Sysvar<'info, Rent>,
}


#[derive(Accounts)]
pub struct ExchangeUsdcForWaterMelon<'info> {

  #[account(mut)]
  pub user_authority : Signer<'info>,


  #[account(
    seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
    bump = ido_account.bumps.ido_account
  )]
  pub ido_account : Account<'info, IdoAccount>,


  #[account(mut,
    constraint = user_usdc.owner == user_authority.key() ,
    constraint = user_usdc.mint == usdc_mint.key() 
  )]
  pub user_usdc : Account<'info, TokenAccount>,

  #[account(mut,
    constraint = user_watermelon.owner == user_authority.key() ,
    constraint = user_watermelon.mint == watermelon_mint.key()
  )]
  pub user_watermelon : Account<'info, TokenAccount>,


  #[account(
    constraint = usdc_mint.key() == ido_account.usdc_mint 
  )]
  pub usdc_mint : Box<Account<'info, Mint>>,


  #[account(
    constraint = watermelon_mint.key() == ido_account.watermelon_mint 
  )]
  pub watermelon_mint : Box<Account<'info, Mint>>,

  #[account(mut,
    seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"pool_usdc".as_ref()],
    bump = ido_account.bumps.pool_usdc
  )]
  pub pool_usdc: Account<'info, TokenAccount>,


  #[account(mut,
    seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"pool_watermelon".as_ref()],
    bump = ido_account.bumps.pool_watermelon
  )]
  pub pool_watermelon : Box<Account<'info, TokenAccount>>,


  pub token_program: Program<'info, Token>,


}


#[derive(Accounts)]
pub struct ExchangeUsdcForRedeemable<'info> {
  pub user_authority: Signer<'info>,

  #[account(mut,
    seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
    bump = ido_account.bumps.ido_account
  )]
  pub ido_account : Account<'info, IdoAccount>,

  #[account(mut,
    constraint = user_usdc.owner == user_authority.key() @ ErrorCode::A ,
    constraint = user_usdc.mint == usdc_mint.key() @ ErrorCode::B
  )]
  pub user_usdc : Account<'info, TokenAccount>,

  #[account(mut,
    seeds = [user_authority.key().as_ref(),
        ido_account.ido_name.as_ref().trim_ascii_whitespace(),
        b"user_redeemable"],
    bump
  )]
  pub user_redeemable : Account<'info, TokenAccount>,


  #[account(mut, 
    seeds = [
      ido_account.ido_name.as_ref().trim_ascii_whitespace(),
      b"pool_usdc".as_ref()
    ],
    bump = ido_account.bumps.pool_usdc
  )]
  pub pool_usdc : Account<'info, TokenAccount>,
  
  #[account(mut,
    seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"redeemable_mint"],
    bump = ido_account.bumps.redeemable_mint
  )]
  pub redeemable_mint: Box<Account<'info, Mint>>,

  #[account(constraint = usdc_mint.key() == ido_account.usdc_mint @ ErrorCode::F)]
  pub usdc_mint : Box<Account<'info, Mint>>,

  pub token_program : Program<'info, Token>
}

#[derive(Accounts)]
pub struct ExchangeRedeemableForWatermelon<'info> {
  #[account(mut)]
  pub user_authority : Signer<'info>,


  #[account(mut,
    seeds = [
      ido_account.ido_name.as_ref().trim_ascii_whitespace()
    ],
    bump = ido_account.bumps.ido_account
  )]
  pub ido_account : Account<'info, IdoAccount>,


  #[account(mut,
    seeds = [
      ido_account.ido_name.as_ref().trim_ascii_whitespace(), 
      b"pool_watermelon".as_ref()
    ],
    bump = ido_account.bumps.pool_watermelon
  )]
  pub pool_watermelon : Account<'info, TokenAccount>,

  #[account(mut,
    seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"redeemable_mint".as_ref()],
    bump = ido_account.bumps.redeemable_mint
  )]
  pub redeemable_mint: Box<Account<'info, Mint>>,


  #[account(constraint = watermelon_mint.key() == ido_account.watermelon_mint)]
  pub watermelon_mint : Box<Account<'info, Mint>>,

  #[account(mut,
    seeds = [user_authority.key().as_ref(),
        ido_account.ido_name.as_ref().trim_ascii_whitespace(),
        b"user_redeemable".as_ref()],
    bump
  )]
  pub user_redeemable: Account<'info, TokenAccount>,

  #[account(mut,
    constraint = user_watermelon.owner == user_authority.key(),
    constraint = user_watermelon.mint == watermelon_mint.key()
  )]
  pub user_watermelon: Account<'info, TokenAccount>,



  pub token_program : Program<'info, Token>



}

#[derive(Accounts)]
pub struct WithdrawPoolUsdc<'info> {
  // User does not have to sign, this allows anyone to redeem on their behalf
  // and prevents forgotten / leftover USDC in the IDO pool.
  pub payer : Signer<'info>,

  #[account(mut,
    constraint = user_authority.key() == ido_account.ido_authority
  )]
  pub user_authority : AccountInfo<'info>,

  #[account(mut,
    constraint = user_usdc.owner == user_authority.key(),
    constraint = user_usdc.mint == usdc_mint.key())]
  pub user_usdc: Box<Account<'info, TokenAccount>>,


  #[account(
    seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace()],
    bump = ido_account.bumps.ido_account
  )]
  pub ido_account : Account<'info, IdoAccount>,

  #[account(mut,
    seeds = [ido_account.ido_name.as_ref().trim_ascii_whitespace(), b"pool_usdc"],
    bump = ido_account.bumps.pool_usdc)]
  pub pool_usdc: Box<Account<'info, TokenAccount>>,

  #[account(
    constraint = ido_account.usdc_mint == usdc_mint.key()
  )]
  pub usdc_mint: Box<Account<'info, Mint>>,

  pub token_program : Program<'info, Token>
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
