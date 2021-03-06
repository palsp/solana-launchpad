use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::IsInitialized;

#[account]
#[derive(Default)]
pub struct IdoAccount {
  pub ido_name: [u8; 10], // Setting an arbitrary max of ten characters in the ido name.
  pub merkle_root: [u8; 32],
  pub bumps: PoolBumps,
  pub ido_authority: Pubkey,
  pub usdc_mint: Pubkey,
  pub redeemable_mint: Pubkey,
  pub watermelon_mint: Pubkey,
  pub pool_usdc: Pubkey,
  pub pool_native: Pubkey,
  pub pool_watermelon: Pubkey,
  pub private_target_investment: u64,
  pub num_ido_tokens_private: u64,
  pub num_ido_tokens_public: u64,
  pub ido_times: IdoTimes,
  pub pool_info: PoolInfo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct IdoTimes {
  pub start_ido: i64,
  pub end_whitelisted: i64,
  pub end_deposits: i64,
  pub end_ido: i64,
}
#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct PoolBumps {
  pub ido_account: u8,
  pub redeemable_mint: u8,
  pub pool_watermelon: u8,
  pub pool_usdc: u8,
  pub pool_native: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone, Copy)]
pub struct PoolInfo {
  pub is_initialized: bool,
  pub redeemable_minted: u64,
}

impl IsInitialized for PoolInfo {
  fn is_initialized(&self) -> bool {
    self.is_initialized
  }
}
