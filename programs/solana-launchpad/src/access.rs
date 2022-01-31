use crate::{
  account::{IdoAccount, IdoTimes},
  error::ErrorCode,
  merkle_proof::MerkleProof,
};
use anchor_lang::prelude::*;

fn only_when_ido_is_started(ido_account: &IdoAccount) -> ProgramResult {
  let clock = Clock::get()?;
  require!(
    clock.unix_timestamp > ido_account.ido_times.start_ido,
    ErrorCode::StartIdoTime
  );

  Ok(())
}

// Asserts the IDO starts in the future.
pub fn validate_ido_times(ido_times: IdoTimes) -> ProgramResult {
  let clock = Clock::get()?;

  require!(
    ido_times.start_ido > clock.unix_timestamp,
    ErrorCode::IdoFuture
  );

  require!(
    ido_times.start_ido < ido_times.end_whitelisted
      && ido_times.end_whitelisted < ido_times.end_deposits
      && ido_times.end_deposits < ido_times.end_ido,
    ErrorCode::SeqTimes
  );

  Ok(())
}

pub fn unrestricted_phase(ido_account: &IdoAccount) -> ProgramResult {
  let clock = Clock::get()?;
  require!(
    clock.unix_timestamp > ido_account.ido_times.start_ido,
    ErrorCode::StartIdoTime
  );
  require!(
    clock.unix_timestamp < ido_account.ido_times.end_deposits,
    ErrorCode::EndDeposits
  );
  Ok(())
}

pub fn whitelisted_phase(ido_account: &IdoAccount) -> ProgramResult {
  let clock = Clock::get()?;
  require!(
    clock.unix_timestamp > ido_account.ido_times.start_ido,
    ErrorCode::StartIdoTime
  );

  require!(
    clock.unix_timestamp < ido_account.ido_times.end_whitelisted,
    ErrorCode::EndWhitelistedTime
  );

  Ok(())
}

pub fn deposit_phase(ido_account: &IdoAccount) -> ProgramResult {
  let clock = Clock::get()?;

  require!(
    clock.unix_timestamp > ido_account.ido_times.end_whitelisted,
    ErrorCode::WhitelistNotOver
  );
  require!(
    clock.unix_timestamp < ido_account.ido_times.end_deposits,
    ErrorCode::EndDeposits
  );

  Ok(())
}

pub fn withdraw_phase(ido_account: &IdoAccount) -> ProgramResult {
  let clock = Clock::get()?;

  require!(
    clock.unix_timestamp > ido_account.ido_times.end_deposits,
    ErrorCode::IdoNotOver
  );
  Ok(())
}

pub fn only_for_whitelisted(proof: Vec<[u8; 32]>, root: [u8; 32], value: &[u8]) -> ProgramResult {
  let leaf = MerkleProof::calc_leaf_hash(value);

  require!(
    MerkleProof::verify(proof, root, leaf),
    ErrorCode::InvalidProof
  );

  Ok(())
}
