use anchor_lang::prelude::*;

#[error]
pub enum ErrorCode {
  #[msg("IDO must start in the future")]
  IdoFuture,
  #[msg("IDO times are non-sequential")]
  SeqTimes,
  #[msg("IDO has not started")]
  StartIdoTime,
  #[msg("Deposit period has ended")]
  EndDeposits,
  #[msg("Whitelisted period has ended")]
  EndWhitelistedTime,
  #[msg("IDO has ended")]
  EndIdoTime,
  #[msg("IDO has not finished yet")]
  IdoNotOver,
  #[msg("Whitelisted period in progress")]
  WhitelistNotOver,
  #[msg("Insufficient USDC")]
  LowUsdc,
  #[msg("Insufficient redeemable tokens")]
  LowRedeemable,
  #[msg("USDC total and redeemable total don't match")]
  UsdcNotEqRedeem,
  #[msg("Given nonce is invalid")]
  InvalidNonce,
  #[msg("Given proof is invalid")]
  InvalidProof,
  #[msg("Unauthorized")]
  Unauthorized,
  #[msg("Given amount out is invalid")]
  InvalidAmountOut,
  #[msg("Amount paid is invalid")]
  InvalidAmountPaid,

  // DEBUG
  #[msg("A")]
  A,
  #[msg("B")]
  B,
  #[msg("C")]
  C,
  #[msg("D")]
  D,
  #[msg("E")]
  E,
  #[msg("F")]
  F,
}
