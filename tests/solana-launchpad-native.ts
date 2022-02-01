import * as anchor from "@project-serum/anchor";
import { describe } from "mocha";
import { Program } from "@project-serum/anchor";
import { SolanaLaunchpad } from "../target/types/solana_launchpad";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as assert from "assert";
import { faker } from "@faker-js/faker";

import {
  sleep,
  getTokenAccount,
  createMint,
  createTokenAccount,
  getProof,
  hash,
  findRelatedProgramAddress,
  createATA,
} from "./utils";

describe("launchpad native", async () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  // @ts-ignore
  const program = anchor.workspace.SolanaLaunchpad as Program<SolanaLaunchpad>;

  const privateTargetInvestment = new anchor.BN(100_000_000_000);
  const watermelonIdoPrivateAmount = new anchor.BN(2_000_000_000_000);
  const watermelonIdoPublicAmount = new anchor.BN(10_000_000_000_000);

  const totalWatermelonIdoAmount = watermelonIdoPrivateAmount.add(
    watermelonIdoPublicAmount
  );

  let usdcMintAccount: Token;
  let usdcMint: anchor.web3.PublicKey;
  let watermelonMintAccount: Token;
  let watermelonMint: anchor.web3.PublicKey;

  let idoAuthorityUsdc: anchor.web3.PublicKey;
  let idoAuthorityWatermelon: anchor.web3.PublicKey;

  it("Initializes the state-of-the-world", async () => {
    usdcMintAccount = await createMint(provider);
    watermelonMintAccount = await createMint(provider);
    usdcMint = usdcMintAccount.publicKey;
    watermelonMint = watermelonMintAccount.publicKey;

    idoAuthorityUsdc = await createTokenAccount(
      provider,
      usdcMint,
      provider.wallet.publicKey
    );

    idoAuthorityWatermelon = await createTokenAccount(
      provider,
      watermelonMint,
      provider.wallet.publicKey
    );

    await watermelonMintAccount.mintTo(
      idoAuthorityWatermelon,
      provider.wallet.publicKey,
      [],
      totalWatermelonIdoAmount.toNumber()
    );

    const _idoAuthorityWatermelonAccount = await getTokenAccount(
      provider,
      idoAuthorityWatermelon
    );

    assert.ok(
      _idoAuthorityWatermelonAccount.amount.eq(totalWatermelonIdoAmount)
    );
  });

  let idoTimes;
  let idoName = faker.name.firstName().slice(0, 10);
  it("should initialize native pool", async () => {
    const [[idoAccount, idoAccountBump], [redeemableMint, redeemableMintBump]] =
      await findRelatedProgramAddress(idoName, program.programId);

    const [poolWatermelon, poolWatermelonBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(idoName), Buffer.from("pool_watermelon")],
        program.programId
      );

    const [poolNative, poolNativeBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(idoName), Buffer.from("pool_native")],
        program.programId
      );

    let bumps = new PoolBumps();
    bumps.idoAccount = idoAccountBump;
    bumps.redeemableMint = redeemableMintBump;
    bumps.poolWatermelon = poolWatermelonBump;
    bumps.poolUsdc = 0;
    bumps.poolNative = poolNativeBump;

    // Initialize ido times
    idoTimes = new IdoTimes();

    const nowBn = new anchor.BN(Date.now() / 1000);
    idoTimes.startIdo = nowBn.add(new anchor.BN(5));
    idoTimes.endWhitelisted = nowBn.add(new anchor.BN(10));
    idoTimes.endDeposits = nowBn.add(new anchor.BN(15));
    idoTimes.endIdo = nowBn.add(new anchor.BN(20));
    await program.rpc.initializePoolNative(
      idoName,
      bumps,
      privateTargetInvestment,
      watermelonIdoPublicAmount,
      watermelonIdoPrivateAmount,
      idoTimes,
      {
        accounts: {
          idoAuthority: provider.wallet.publicKey,
          idoAuthorityWatermelon,
          idoAccount,
          redeemableMint,
          watermelonMint,
          poolWatermelon,
          poolNative,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
  });

  const firstDeposit = new anchor.BN(10_000_000);
  it("should deposit USDC for redeemable", async () => {
    if (Date.now() < idoTimes.endWhitelisted.toNumber() * 1000) {
      await sleep(
        idoTimes.endWhitelisted.toNumber() * 1000 - Date.now() + 2100
      );
    }

    // find related program address
    const [[idoAccount], [redeemableMint]] = await findRelatedProgramAddress(
      idoName,
      program.programId
    );

    const [poolNative] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_native")],
      program.programId
    );

    // create user redeemable account
    const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
      [
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(idoName),
        Buffer.from("user_redeemable"),
      ],
      program.programId
    );
    await program.rpc.exchangeNativeForRedeemable(firstDeposit, {
      accounts: {
        userAuthority: provider.wallet.publicKey,
        idoAccount,
        userRedeemable,
        redeemableMint,
        poolNative,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      preInstructions: [
        program.instruction.initUserRedeemable({
          accounts: {
            userAuthority: program.provider.wallet.publicKey,
            userRedeemable,
            idoAccount,
            redeemableMint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
        }),
      ],
    });
  });

  let userWatermelon: anchor.web3.PublicKey;
  it("should exchange redeemable for watermelon", async () => {
    if (Date.now() < idoTimes.endIdo.toNumber() * 1000) {
      await sleep(idoTimes.endIdo.toNumber() * 1000 - Date.now() + 2000);
    }
    const [[idoAccount], [redeemableMint]] = await findRelatedProgramAddress(
      idoName,
      program.programId
    );

    userWatermelon = await createATA(provider.wallet, watermelonMint, provider);

    const [poolWatermelon] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_watermelon")],
      program.programId
    );

    const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
      [
        program.provider.wallet.publicKey.toBuffer(),
        Buffer.from(idoName),
        Buffer.from("user_redeemable"),
      ],
      program.programId
    );

    await program.rpc.exchangeRedeemableForWatermelon(firstDeposit, {
      accounts: {
        userAuthority: program.provider.wallet.publicKey,
        idoAccount,
        poolWatermelon,
        redeemableMint,
        watermelonMint,
        userRedeemable,
        userWatermelon,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });

    const userWatermelonInfo = await getTokenAccount(provider, userWatermelon);

    console.log("first user watermelon ", userWatermelonInfo.amount.toString());
  });

  it("should withdraw", async () => {
    const [[idoAccount]] = await findRelatedProgramAddress(
      idoName,
      program.programId
    );
    const [poolNative] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_native")],
      program.programId
    );

    let idoAuthorityAccountInfo = await provider.connection.getAccountInfo(
      program.provider.wallet.publicKey
    );
    console.log("before ", idoAuthorityAccountInfo.lamports);
    await program.rpc.withdrawNative(firstDeposit, {
      accounts: {
        userAuthority: provider.wallet.publicKey,
        idoAccount,
        poolNative,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
    });

    idoAuthorityAccountInfo = await provider.connection.getAccountInfo(
      program.provider.wallet.publicKey
    );
    console.log("after ", idoAuthorityAccountInfo.lamports);
  });

  function PoolBumps() {
    this.idoAccount;
    this.redeemableMint;
    this.poolWatermelon;
    this.poolUsdc;
    this.poolNative;
  }

  function IdoTimes() {
    this.startIdo;
    this.endWhitelisted;
    this.endDeposits;
    this.endIdo;
  }
});
