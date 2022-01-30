import * as anchor from "@project-serum/anchor";
import {
  sleep,
  getTokenAccount,
  createMint,
  createTokenAccount,
} from "./utils";
import { Program } from "@project-serum/anchor";
import { SolanaLaunchpad } from "../target/types/solana_launchpad";
import {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as assert from "assert";

import { faker } from "@faker-js/faker";
import { describe } from "mocha";

describe("solana-launchpad", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();

  anchor.setProvider(provider);

  // @ts-ignore
  const program = anchor.workspace.SolanaLaunchpad as Program<SolanaLaunchpad>;

  // All mints default to 6 decimal places.
  const watermelonIdoAmount = new anchor.BN(5000000);

  // These are all of the variables we assume exist in the world already and
  // are available to the client.
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
      watermelonIdoAmount.toNumber()
    );

    const _idoAuthorityWatermelonAccount = await getTokenAccount(
      provider,
      idoAuthorityWatermelon
    );

    assert.ok(_idoAuthorityWatermelonAccount.amount.eq(watermelonIdoAmount));
  });
  // These are all variables the client will need to create in order to
  // initialize the IDO pool
  let idoTimes;
  let idoName = faker.name.firstName().slice(0, 10);
  it("Is initializes the IDO pool", async () => {
    let bumps = new PoolBumps();

    const [idoAccount, idoAccountBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(idoName)],
        program.programId
      );

    bumps.idoAccount = idoAccountBump;

    const [redeemableMint, redeemableMintBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(idoName), Buffer.from("redeemable_mint")],
        program.programId
      );
    bumps.redeemableMint = redeemableMintBump;

    const [poolWatermelon, poolWatermelonBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(idoName), Buffer.from("pool_watermelon")],
        program.programId
      );
    bumps.poolWatermelon = poolWatermelonBump;

    const [poolUsdc, poolUsdcBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(idoName), Buffer.from("pool_usdc")],
        program.programId
      );
    bumps.poolUsdc = poolUsdcBump;
    idoTimes = new IdoTimes();
    const nowBn = new anchor.BN(Date.now() / 1000);
    idoTimes.startIdo = nowBn.add(new anchor.BN(5));
    idoTimes.endDeposits = nowBn.add(new anchor.BN(10));
    idoTimes.endIdo = nowBn.add(new anchor.BN(15));
    idoTimes.endEscrow = nowBn.add(new anchor.BN(16));

    await program.rpc.initializePool(
      idoName,
      bumps,
      watermelonIdoAmount,
      idoTimes,
      {
        accounts: {
          idoAuthority: provider.wallet.publicKey,
          idoAuthorityWatermelon,
          idoAccount,
          watermelonMint,
          usdcMint,
          redeemableMint,
          poolWatermelon,
          poolUsdc,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );

    const _idoAuthorityWatermelonAccount = await getTokenAccount(
      provider,
      idoAuthorityWatermelon
    );

    assert.ok(_idoAuthorityWatermelonAccount.amount.eq(new anchor.BN(0)));
  });

  let userUsdc: anchor.web3.PublicKey;
  const firstDeposit = new anchor.BN(10_000_349);

  it("Exchanges user USDC for redeemable tokens", async () => {
    // Wait until the IDO has opened.
    if (Date.now() < idoTimes.startIdo.toNumber() * 1000) {
      await sleep(idoTimes.startIdo.toNumber() * 1000 - Date.now() + 2000);
    }

    const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName)],
      program.programId
    );

    const [redeemableMint] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("redeemable_mint")],
      program.programId
    );

    const [poolUsdc] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_usdc")],
      program.programId
    );

    userUsdc = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      usdcMint,
      program.provider.wallet.publicKey
    );

    // Get the instructions to add to the RPC call
    let createUserUsdcInstr = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      usdcMint,
      userUsdc,
      program.provider.wallet.publicKey,
      program.provider.wallet.publicKey
    );
    let createUserUsdcTx = new anchor.web3.Transaction().add(
      createUserUsdcInstr
    );
    await provider.send(createUserUsdcTx);
    await usdcMintAccount.mintTo(
      userUsdc,
      provider.wallet.publicKey,
      [],
      firstDeposit.toNumber()
    );
    const _userUsdcAccount = await getTokenAccount(provider, userUsdc);
    assert.ok(_userUsdcAccount.amount.eq(firstDeposit));

    const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
      [
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(idoName),
        Buffer.from("user_redeemable"),
      ],
      program.programId
    );

    const tx = await program.rpc.exchangeUsdcForRedeemable(firstDeposit, {
      accounts: {
        userAuthority: provider.wallet.publicKey,
        userUsdc,
        userRedeemable,
        idoAccount,
        usdcMint,
        redeemableMint,
        poolUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      instructions: [
        program.instruction.initUserRedeemable({
          accounts: {
            userAuthority: provider.wallet.publicKey,
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

    const _poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
    assert.ok(_poolUsdcAccount.amount.eq(firstDeposit));
    const _userRedeemableAccount = await getTokenAccount(
      provider,
      userRedeemable
    );
    assert.ok(_userRedeemableAccount.amount.eq(firstDeposit));
  });

  const secondDeposit = new anchor.BN(23_000_672);
  let totalPoolUsdc,
    secondUserKeypair: anchor.web3.Keypair,
    secondUserUsdc: anchor.web3.PublicKey;

  it("Exchanges a second users USDC for redeemable tokens", async () => {
    const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName)],
      program.programId
    );

    const [redeemableMint] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("redeemable_mint")],
      program.programId
    );

    const [poolUsdc] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_usdc")],
      program.programId
    );

    secondUserKeypair = anchor.web3.Keypair.generate();

    const transferSolIx = anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      lamports: 100_000_000_000, // 100 sol
      toPubkey: secondUserKeypair.publicKey,
    });

    secondUserUsdc = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      usdcMint,
      secondUserKeypair.publicKey
    );

    const createSecondUserUsdcIx =
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        usdcMint,
        secondUserUsdc,
        secondUserKeypair.publicKey,
        provider.wallet.publicKey
      );

    let createSecondUserUsdcTx = new anchor.web3.Transaction();
    createSecondUserUsdcTx.add(transferSolIx);
    createSecondUserUsdcTx.add(createSecondUserUsdcIx);

    await provider.send(createSecondUserUsdcTx);

    await usdcMintAccount.mintTo(
      secondUserUsdc,
      provider.wallet.publicKey,
      [],
      secondDeposit.toNumber()
    );

    let _secondUserUsdc = await getTokenAccount(provider, secondUserUsdc);
    assert.ok(_secondUserUsdc.amount.eq(secondDeposit));

    const [secondUserRedeemable] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          secondUserKeypair.publicKey.toBuffer(),
          Buffer.from(idoName),
          Buffer.from("user_redeemable"),
        ],
        program.programId
      );

    const tx = await program.rpc.exchangeUsdcForRedeemable(secondDeposit, {
      accounts: {
        userAuthority: secondUserKeypair.publicKey,
        userUsdc: secondUserUsdc,
        userRedeemable: secondUserRedeemable,
        idoAccount,
        usdcMint,
        redeemableMint,
        poolUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [secondUserKeypair],
      preInstructions: [
        program.instruction.initUserRedeemable({
          accounts: {
            userAuthority: secondUserKeypair.publicKey,
            userRedeemable: secondUserRedeemable,
            idoAccount,
            redeemableMint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
          signers: [secondUserKeypair],
        }),
      ],
    });

    _secondUserUsdc = await getTokenAccount(provider, secondUserUsdc);
    assert.ok(_secondUserUsdc.amount.eq(new anchor.BN(0)));

    let _secondUserRedeemable = await getTokenAccount(
      provider,
      secondUserRedeemable
    );
    assert.ok(_secondUserRedeemable.amount.eq(secondDeposit));

    totalPoolUsdc = firstDeposit.add(secondDeposit);

    let _poolUSDC = await getTokenAccount(provider, poolUsdc);

    assert.ok(_poolUSDC.amount.eq(totalPoolUsdc));
  });
  const firstWithdrawal = new anchor.BN(2_000_000);
  it("Exchanges user Redeemable tokens for USDC", async () => {
    const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName)],
      program.programId
    );

    const [redeemableMint] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("redeemable_mint")],
      program.programId
    );

    const [poolUsdc] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_usdc")],
      program.programId
    );

    const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
      [
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(idoName),
        Buffer.from("user_redeemable"),
      ],
      program.programId
    );

    const [escrowUsdc] = await anchor.web3.PublicKey.findProgramAddress(
      [
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(idoName),
        Buffer.from("escrow_usdc"),
      ],
      program.programId
    );

    await program.rpc.exchangeRedeemableForUsdc(firstWithdrawal, {
      accounts: {
        userAuthority: provider.wallet.publicKey,
        escrowUsdc: escrowUsdc,
        userRedeemable,
        idoAccount,
        usdcMint,
        watermelonMint,
        redeemableMint,
        poolUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      preInstructions: [
        program.instruction.initEscrowUsdc({
          accounts: {
            userAuthority: provider.wallet.publicKey,
            escrowUsdc,
            idoAccount,
            usdcMint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          },
        }),
      ],
    });

    totalPoolUsdc = totalPoolUsdc.sub(firstWithdrawal);
    const _poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
    assert.ok(_poolUsdcAccount.amount.eq(totalPoolUsdc));
    const _escrowUsdcAccount = await getTokenAccount(provider, escrowUsdc);
    assert.ok(_escrowUsdcAccount.amount.eq(firstWithdrawal));
  });

  it("Exchanges user Redeemable tokens for watermelon", async () => {
    // Wait until the IDO has ended.
    if (Date.now() < idoTimes.endIdo.toNumber() * 1000) {
      await sleep(idoTimes.endIdo.toNumber() * 1000 - Date.now() + 3000);
    }

    const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName)],
      program.programId
    );

    const [poolWatermelon] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_watermelon")],
      program.programId
    );

    const [redeemableMint] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("redeemable_mint")],
      program.programId
    );

    const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
      [
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(idoName),
        Buffer.from("user_redeemable"),
      ],
      program.programId
    );

    const firstUserRedeemable = firstDeposit.sub(firstWithdrawal);
    // TODO we've been lazy here and not used an ATA as we did with USDC
    const userWatermelon = await createTokenAccount(
      provider,
      watermelonMint,
      provider.wallet.publicKey
    );

    await program.rpc.exchangeRedeemableForWatermelon(firstUserRedeemable, {
      accounts: {
        payer: provider.wallet.publicKey,
        userAuthority: provider.wallet.publicKey,
        userWatermelon,
        userRedeemable,
        idoAccount,
        watermelonMint,
        redeemableMint,
        poolWatermelon,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });

    const _poolWatermelonAccount = await getTokenAccount(
      provider,
      poolWatermelon
    );
    let redeemedWatermelon = firstUserRedeemable
      .mul(watermelonIdoAmount)
      .div(totalPoolUsdc);
    let remainingWatermelon = watermelonIdoAmount.sub(redeemedWatermelon);
    assert.ok(_poolWatermelonAccount.amount.eq(remainingWatermelon));
    const _userWatermelonAccount = await getTokenAccount(
      provider,
      userWatermelon
    );
    assert.ok(_userWatermelonAccount.amount.eq(redeemedWatermelon));
  });

  it("Exchanges second user's Redeemable tokens for watermelon", async () => {
    const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName)],
      program.programId
    );

    const [redeemableMint] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("redeemable_mint")],
      program.programId
    );

    const [secondUserRedeemable] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          secondUserKeypair.publicKey.toBuffer(),
          Buffer.from(idoName),
          Buffer.from("user_redeemable"),
        ],
        program.programId
      );

    const [poolWatermelon] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_watermelon")],
      program.programId
    );

    const _secondUserWatermelon = await createTokenAccount(
      provider,
      watermelonMint,
      secondUserKeypair.publicKey
    );

    await program.rpc.exchangeRedeemableForWatermelon(secondDeposit, {
      accounts: {
        payer: provider.wallet.publicKey,
        userAuthority: secondUserKeypair.publicKey,
        userWatermelon: _secondUserWatermelon,
        userRedeemable: secondUserRedeemable,
        idoAccount,
        watermelonMint,
        redeemableMint,
        poolWatermelon,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });

    const _poolWatermelonAccount = await getTokenAccount(
      provider,
      poolWatermelon
    );
    assert.ok(_poolWatermelonAccount.amount.eq(new anchor.BN(0)));
  });

  it("Withdraws total USDC from pool account", async () => {
    const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName)],
      program.programId
    );

    const [poolUsdc] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_usdc")],
      program.programId
    );

    await program.rpc.withdrawPoolUsdc({
      accounts: {
        idoAuthority: provider.wallet.publicKey,
        idoAuthorityUsdc,
        idoAccount,
        usdcMint,
        watermelonMint,
        poolUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });

    const _poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
    assert.ok(_poolUsdcAccount.amount.eq(new anchor.BN(0)));
    const _idoAuthorityUsdcAccount = await getTokenAccount(
      provider,
      idoAuthorityUsdc
    );
    assert.ok(_idoAuthorityUsdcAccount.amount.eq(totalPoolUsdc));
  });

  it("Withdraws USDC from the escrow account after waiting period is over", async () => {
    // Wait until the escrow period is over.
    if (Date.now() < idoTimes.endEscrow.toNumber() * 1000 + 1000) {
      await sleep(idoTimes.endEscrow.toNumber() * 1000 - Date.now() + 4000);
    }

    const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName)],
      program.programId
    );

    const [escrowUsdc] = await anchor.web3.PublicKey.findProgramAddress(
      [
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(idoName),
        Buffer.from("escrow_usdc"),
      ],
      program.programId
    );

    await program.rpc.withdrawFromEscrow(firstWithdrawal, {
      accounts: {
        payer: provider.wallet.publicKey,
        userAuthority: provider.wallet.publicKey,
        userUsdc,
        escrowUsdc,
        idoAccount,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });

    const _userUsdcAccount = await getTokenAccount(provider, userUsdc);
    assert.ok(_userUsdcAccount.amount.eq(firstWithdrawal));
  });
  function PoolBumps() {
    this.idoAccount;
    this.redeemableMint;
    this.poolWatermelon;
    this.poolUsdc;
  }

  function IdoTimes() {
    this.startIdo;
    this.endDeposts;
    this.endIdo;
    this.endEscrow;
  }
});
