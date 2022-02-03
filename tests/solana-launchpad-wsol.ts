import * as anchor from "@project-serum/anchor";
import { describe } from "mocha";
import { Program } from "@project-serum/anchor";
import { SolanaLaunchpad } from "../target/types/solana_launchpad";
import { Token, TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import * as assert from "assert";
import { faker } from "@faker-js/faker";

import {
  sleep,
  getTokenAccount,
  createMint,
  createTokenAccount,
  createWrapNativeAccount,
  findRelatedProgramAddress,
  createATA,
  requestAirdrop,
} from "./utils";

describe("launchpad wsol", async () => {
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

  let usdcMint: anchor.web3.PublicKey = NATIVE_MINT;
  let watermelonMintAccount: Token;
  let watermelonMint: anchor.web3.PublicKey;

  let idoAuthorityUsdc: anchor.web3.PublicKey;
  let idoAuthorityWatermelon: anchor.web3.PublicKey;

  it("Initializes the state-of-the-world", async () => {
    watermelonMintAccount = await createMint(provider);
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
  });

  let idoTimes;
  let idoName = faker.name.firstName().slice(0, 10);
  it("should initialize WSOL pool", async () => {
    const [
      [idoAccount, idoAccountBump],
      [redeemableMint, redeemableMintBump],
      [poolUsdc, poolUsdcBump],
    ] = await findRelatedProgramAddress(idoName, program.programId);

    const [poolWatermelon, poolWatermelonBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(idoName), Buffer.from("pool_watermelon")],
        program.programId
      );

    let bumps = new PoolBumps();
    bumps.idoAccount = idoAccountBump;
    bumps.redeemableMint = redeemableMintBump;
    bumps.poolWatermelon = poolWatermelonBump;
    bumps.poolUsdc = poolUsdcBump;

    // Initialize ido times
    idoTimes = new IdoTimes();

    const nowBn = new anchor.BN(Date.now() / 1000);
    idoTimes.startIdo = nowBn.add(new anchor.BN(5));
    idoTimes.endWhitelisted = nowBn.add(new anchor.BN(6));
    idoTimes.endDeposits = nowBn.add(new anchor.BN(15));
    idoTimes.endIdo = nowBn.add(new anchor.BN(16));

    await program.rpc.initializePool(
      idoName,
      bumps,
      privateTargetInvestment,
      watermelonIdoPublicAmount,
      watermelonIdoPrivateAmount,
      idoTimes,
      null,
      {
        accounts: {
          idoAuthority: provider.wallet.publicKey,
          idoAuthorityWatermelon,
          idoAccount,
          redeemableMint,
          watermelonMint,
          poolWatermelon,
          usdcMint,
          poolUsdc,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
  });

  const investor1 = anchor.web3.Keypair.generate();
  const firstDeposit = new anchor.BN(10_000_000);
  let investor1WSol: anchor.web3.PublicKey;
  it("should deposit WSOL for redeemable", async () => {
    if (Date.now() < idoTimes.endWhitelisted.toNumber() * 1000) {
      await sleep(
        idoTimes.endWhitelisted.toNumber() * 1000 - Date.now() + 2100
      );
    }

    // find related program address
    const [[idoAccount], [redeemableMint], [poolUsdc]] =
      await findRelatedProgramAddress(idoName, program.programId);

    await requestAirdrop(investor1.publicKey, provider);

    investor1WSol = await createWrapNativeAccount(
      provider,
      investor1.publicKey,
      firstDeposit.toNumber()
    );

    // create user redeemable account
    const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
      [
        investor1.publicKey.toBuffer(),
        Buffer.from(idoName),
        Buffer.from("user_redeemable"),
      ],
      program.programId
    );

    await program.rpc.exchangeUsdcForRedeemable(firstDeposit, {
      accounts: {
        userAuthority: investor1.publicKey,
        idoAccount,
        userUsdc: investor1WSol,
        userRedeemable,
        usdcMint,
        redeemableMint,
        poolUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [investor1],
      preInstructions: [
        program.instruction.initUserRedeemable({
          accounts: {
            userAuthority: investor1.publicKey,
            userRedeemable,
            idoAccount,
            redeemableMint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          signers: [investor1],
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

    userWatermelon = await createATA(investor1, watermelonMint, provider);

    const [poolWatermelon] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_watermelon")],
      program.programId
    );

    const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
      [
        investor1.publicKey.toBuffer(),
        Buffer.from(idoName),
        Buffer.from("user_redeemable"),
      ],
      program.programId
    );

    await program.rpc.exchangeRedeemableForWatermelon(firstDeposit, {
      accounts: {
        userAuthority: investor1.publicKey,
        idoAccount,
        poolWatermelon,
        redeemableMint,
        watermelonMint,
        userRedeemable,
        userWatermelon,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [investor1],
    });

    const userWatermelonInfo = await getTokenAccount(provider, userWatermelon);

    const idoAccountInfo = await program.account.idoAccount.fetch(idoAccount);
    assert.ok(idoAccountInfo.poolInfo.isInitialized);

    const amountOut = firstDeposit
      .mul(watermelonIdoPublicAmount)
      .div(idoAccountInfo.poolInfo.redeemableMinted);

    assert.ok(userWatermelonInfo.amount.eq(amountOut));
  });

  it("should withdraw", async () => {
    const [[idoAccount], , [poolUsdc]] = await findRelatedProgramAddress(
      idoName,
      program.programId
    );
    let userUsdcAccountInfo = await getTokenAccount(provider, idoAuthorityUsdc);
    assert.ok(userUsdcAccountInfo.amount.eq(new anchor.BN(0)));
    await program.rpc.withdrawPoolUsdc({
      accounts: {
        payer: provider.wallet.publicKey,
        userAuthority: provider.wallet.publicKey,
        userUsdc: idoAuthorityUsdc,
        idoAccount,
        poolUsdc,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });

    userUsdcAccountInfo = await getTokenAccount(provider, idoAuthorityUsdc);
    assert.ok(userUsdcAccountInfo.amount.eq(firstDeposit));

    // Unwrap WSOL to SOL
    // const investor1WSolAccInfo = await getTokenAccount(provider, investor1WSol);
    // console.log("token amount", investor1WSolAccInfo.amount.toString());

    // const ix = Token.createCloseAccountInstruction(
    //   TOKEN_PROGRAM_ID,
    //   investor1WSol,
    //   investor1.publicKey,
    //   investor1.publicKey,
    //   []
    // );

    // let investor1AccountInfo = await provider.connection.getAccountInfo(
    //   investor1.publicKey
    // );

    // const tx = new anchor.web3.Transaction().add(ix);
    // await provider.send(tx, [investor1]);

    // investor1AccountInfo = await provider.connection.getAccountInfo(
    //   investor1.publicKey
    // );
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
