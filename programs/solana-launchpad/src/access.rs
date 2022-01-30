use crate::{
  account::{IdoAccount, IdoTimes},
  error::ErrorCode,
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
    ido_times.start_ido < ido_times.end_deposits
      && ido_times.end_deposits < ido_times.end_ido
      && ido_times.end_ido < ido_times.end_escrow,
    ErrorCode::SeqTimes
  );

  Ok(())
}

// Asserts the IDO is still accepting deposits.
pub fn unrestricted_phase(ido_account: &IdoAccount) -> ProgramResult {
  let clock = Clock::get()?;

  only_when_ido_is_started(ido_account)?;

  require!(
    ido_account.ido_times.end_deposits > clock.unix_timestamp,
    ErrorCode::EndDepositsTime
  );

  Ok(())
}

// Asserts the IDO has started but not yet finished.
pub fn withdraw_phase(ido_account: &IdoAccount) -> ProgramResult {
  let clock = Clock::get()?;

  only_when_ido_is_started(ido_account)?;

  require!(
    ido_account.ido_times.end_ido > clock.unix_timestamp,
    ErrorCode::EndIdoTime
  );

  Ok(())
}

// Asserts the IDO sale period has ended.
pub fn ido_over(ido_account: &IdoAccount) -> ProgramResult {
  let clock = Clock::get()?;

  require!(
    clock.unix_timestamp > ido_account.ido_times.end_ido,
    ErrorCode::IdoNotOver
  );

  Ok(())
}

pub fn escrow_over(ido_account: &IdoAccount) -> ProgramResult {
  let clock = Clock::get()?;

  require!(
    clock.unix_timestamp > ido_account.ido_times.end_escrow,
    ErrorCode::EscrowNotOver
  );

  Ok(())
}
