import * as anchor from "@project-serum/anchor";
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
import { Program } from "@project-serum/anchor";
import { SolanaLaunchpad } from "../target/types/solana_launchpad";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as assert from "assert";

import { faker } from "@faker-js/faker";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { describe } from "mocha";

describe("solana-launchpad", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  // @ts-ignore
  const program = anchor.workspace.SolanaLaunchpad as Program<SolanaLaunchpad>;

  const privateTargetInvestment = new anchor.BN(100_000);
  const watermelonIdoPrivateAmount = new anchor.BN(2_000_000);
  const watermelonIdoPublicAmount = new anchor.BN(10_000_000);

  const totalWatermelonIdoAmount = watermelonIdoPrivateAmount.add(
    watermelonIdoPublicAmount
  );

  let usdcMintAccount: Token;
  let usdcMint: anchor.web3.PublicKey;
  let watermelonMintAccount: Token;
  let watermelonMint: anchor.web3.PublicKey;

  let idoAuthorityUsdc: anchor.web3.PublicKey;
  let idoAuthorityWatermelon: anchor.web3.PublicKey;

  const usersAcc: anchor.web3.Keypair[] = [];
  const NUM_USER = 10;
  for (let i = 0; i < NUM_USER; i++) {
    usersAcc.push(anchor.web3.Keypair.generate());
  }

  const leaves = usersAcc.map((acc) => hash(acc.publicKey.toBuffer()));

  leaves.push(hash(program.provider.wallet.publicKey.toBuffer()));

  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

  // sent to client
  const rootHex = tree.getHexRoot();

  const root = Buffer.from(rootHex.slice(2), "hex");

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
  it("should initialize pool", async () => {
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

    // Initialize ido pool bumps
    let bumps = new PoolBumps();
    bumps.idoAccount = idoAccountBump;
    bumps.redeemableMint = redeemableMintBump;
    bumps.poolWatermelon = poolWatermelonBump;
    bumps.poolUsdc = poolUsdcBump;

    // Initialize ido times
    idoTimes = new IdoTimes();

    const nowBn = new anchor.BN(Date.now() / 1000);
    idoTimes.startIdo = nowBn.add(new anchor.BN(5));
    idoTimes.endWhitelisted = nowBn.add(new anchor.BN(10));
    idoTimes.endDeposits = nowBn.add(new anchor.BN(15));
    idoTimes.endIdo = nowBn.add(new anchor.BN(20));

    await program.rpc.initializePool(
      idoName,
      bumps,
      privateTargetInvestment,
      watermelonIdoPublicAmount,
      watermelonIdoPrivateAmount,
      idoTimes,
      [...root],
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
  });

  let userUsdc: anchor.web3.PublicKey;
  let userWatermelon: anchor.web3.PublicKey;
  let userWatermelonAmount: anchor.BN;
  const whitelistDeposit = new anchor.BN(10_000);

  it("should exchange USDC for watermelon (whitelisted)", async () => {
    // Wait until the IDO has opened.
    if (Date.now() < idoTimes.startIdo.toNumber() * 1000) {
      await sleep(idoTimes.startIdo.toNumber() * 1000 - Date.now() + 2000);
    }

    const [[idoAccount], , [poolUsdc]] = await findRelatedProgramAddress(
      idoName,
      program.programId
    );

    const [poolWatermelon] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_watermelon")],
      program.programId
    );

    userUsdc = await createATA(program.provider.wallet, usdcMint, provider);
    await usdcMintAccount.mintTo(
      userUsdc,
      provider.wallet.publicKey,
      [],
      whitelistDeposit.toNumber()
    );

    userWatermelon = await createATA(
      program.provider.wallet,
      watermelonMint,
      provider
    );

    let userUsdcAccountInfo = await getTokenAccount(provider, userUsdc);
    assert.ok(userUsdcAccountInfo.amount.eq(whitelistDeposit));

    const proof = getProof(tree, program.provider.wallet.publicKey);

    const amountOut = whitelistDeposit
      .mul(watermelonIdoPrivateAmount)
      .div(privateTargetInvestment);
    await program.rpc.exchangeUsdcForWatermelon(proof, amountOut, {
      accounts: {
        userAuthority: program.provider.wallet.publicKey,
        idoAccount,
        userUsdc,
        userWatermelon,
        usdcMint,
        watermelonMint,
        poolUsdc,
        poolWatermelon,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
    });
    const prevAmount = userUsdcAccountInfo.amount;
    userUsdcAccountInfo = await getTokenAccount(provider, userUsdc);
    assert.ok(userUsdcAccountInfo.amount.eq(prevAmount.sub(whitelistDeposit)));
    const userWatermelonAccountInfo = await getTokenAccount(
      provider,
      userWatermelon
    );
    assert.ok(userWatermelonAccountInfo.amount.eq(amountOut));
    userWatermelonAmount = amountOut;
  });

  const firstDeposit = new anchor.BN(10_000_349);

  it("should deposit USDC for redeemable", async () => {
    if (Date.now() < idoTimes.endWhitelisted.toNumber() * 1000) {
      await sleep(
        idoTimes.endWhitelisted.toNumber() * 1000 - Date.now() + 2000
      );
    }

    // find related program address
    const [[idoAccount], [redeemableMint], [poolUsdc]] =
      await findRelatedProgramAddress(idoName, program.programId);

    // create user redeemable account
    const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
      [
        provider.wallet.publicKey.toBuffer(),
        Buffer.from(idoName),
        Buffer.from("user_redeemable"),
      ],
      program.programId
    );

    // mint usdc to user account
    await usdcMintAccount.mintTo(
      userUsdc,
      provider.wallet.publicKey,
      [],
      firstDeposit.toNumber()
    );
    let userUsdcAccountInfo = await getTokenAccount(provider, userUsdc);
    assert.ok(userUsdcAccountInfo.amount.eq(firstDeposit));

    // send transaction
    await program.rpc.exchangeUsdcForRedeemable(firstDeposit, {
      accounts: {
        userAuthority: program.provider.wallet.publicKey,
        idoAccount,
        userUsdc,
        userRedeemable,
        usdcMint,
        redeemableMint,
        poolUsdc,
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

  let secondUserKeypair = anchor.web3.Keypair.generate();
  let secondUserUsdc: anchor.web3.PublicKey;
  const secondDeposit = new anchor.BN(23_000_672);
  it("should deposit USDC for redeemable (second user)", async () => {
    if (Date.now() < idoTimes.endWhitelisted.toNumber() * 1000) {
      await sleep(
        idoTimes.endWhitelisted.toNumber() * 1000 - Date.now() + 2000
      );
    }

    // find related program address
    const [[idoAccount], [redeemableMint], [poolUsdc]] =
      await findRelatedProgramAddress(idoName, program.programId);

    // create user redeemable account
    const [secondUserRedeemable] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          secondUserKeypair.publicKey.toBuffer(),
          Buffer.from(idoName),
          Buffer.from("user_redeemable"),
        ],
        program.programId
      );

    // create second user usdc account
    secondUserUsdc = await createATA(
      secondUserKeypair,
      usdcMint,
      provider,
      true
    );

    // mint usdc to user account
    await usdcMintAccount.mintTo(
      secondUserUsdc,
      provider.wallet.publicKey,
      [],
      secondDeposit.toNumber()
    );

    let userUsdcAccountInfo = await getTokenAccount(provider, secondUserUsdc);
    assert.ok(userUsdcAccountInfo.amount.eq(secondDeposit));

    // send transaction
    await program.rpc.exchangeUsdcForRedeemable(secondDeposit, {
      accounts: {
        userAuthority: secondUserKeypair.publicKey,
        idoAccount,
        userUsdc: secondUserUsdc,
        userRedeemable: secondUserRedeemable,
        usdcMint,
        redeemableMint,
        poolUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
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
      signers: [secondUserKeypair],
    });
  });

  it("should exchange redeemable for watermelon", async () => {
    if (Date.now() < idoTimes.endIdo.toNumber() * 1000) {
      await sleep(idoTimes.endIdo.toNumber() * 1000 - Date.now() + 2000);
    }
    const [[idoAccount], [redeemableMint]] = await findRelatedProgramAddress(
      idoName,
      program.programId
    );

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
    const idoAccountInfo = await program.account.idoAccount.fetch(idoAccount);
    assert.ok(idoAccountInfo.poolInfo.isInitialized);

    const amountOut = firstDeposit
      .mul(watermelonIdoPublicAmount)
      .div(idoAccountInfo.poolInfo.redeemableMinted);

    // amount of public + private
    assert.ok(
      userWatermelonInfo.amount.eq(amountOut.add(userWatermelonAmount))
    );
  });

  let secondUserWatermelon: anchor.web3.PublicKey;
  it("should exchange redeemable for watermelon (second user)", async () => {
    if (Date.now() < idoTimes.endIdo.toNumber() * 1000) {
      await sleep(idoTimes.endIdo.toNumber() * 1000 - Date.now() + 2000);
    }
    const [[idoAccount], [redeemableMint]] = await findRelatedProgramAddress(
      idoName,
      program.programId
    );

    const [poolWatermelon] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(idoName), Buffer.from("pool_watermelon")],
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

    secondUserWatermelon = await createATA(
      secondUserKeypair,
      watermelonMint,
      provider
    );

    await program.rpc.exchangeRedeemableForWatermelon(secondDeposit, {
      accounts: {
        userAuthority: secondUserKeypair.publicKey,
        userRedeemable: secondUserRedeemable,
        userWatermelon: secondUserWatermelon,
        idoAccount,
        poolWatermelon,
        redeemableMint,
        watermelonMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [secondUserKeypair],
    });
    const secondUserWatermelonInfo = await getTokenAccount(
      provider,
      secondUserWatermelon
    );

    const idoAccountInfo = await program.account.idoAccount.fetch(idoAccount);

    const amountOut = secondDeposit
      .mul(watermelonIdoPublicAmount)
      .div(idoAccountInfo.poolInfo.redeemableMinted);

    assert.ok(secondUserWatermelonInfo.amount.eq(amountOut));
  });

  function PoolBumps() {
    this.idoAccount;
    this.redeemableMint;
    this.poolWatermelon;
    this.poolUsdc;
  }

  function IdoTimes() {
    this.startIdo;
    this.endWhitelisted;
    this.endDeposits;
    this.endIdo;
  }
});
