use anchor_lang::prelude::*;

#[error]
pub enum ErrorCode {
  #[msg("IDO must start in the future")]
  IdoFuture,
  #[msg("IDO times are non-sequential")]
  SeqTimes,
  #[msg("IDO has not started")]
  StartIdoTime,
  #[msg("Whitelisted period has ended")]
  EndWhitelistedTime,
  #[msg("IDO has ended")]
  EndIdoTime,
  #[msg("IDO has not finished yet")]
  IdoNotOver,
  #[msg("Escrow period has not finished yet")]
  EscrowNotOver,
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
}
