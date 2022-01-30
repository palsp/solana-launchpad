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
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
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
    idoTimes.endIdo = nowBn.add(new anchor.BN(15));

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
  const whitelistDeposit = new anchor.BN(10_000);

  it("should exchange USDC for watermelon", async () => {
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
    this.endIdo;
    this.endEscrow;
  }
});
// describe("solana-launchpad", () => {
//   // Configure the client to use the local cluster.
//   const provider = anchor.Provider.env();

//   anchor.setProvider(provider);

//   // @ts-ignore
//   const program = anchor.workspace.SolanaLaunchpad as Program<SolanaLaunchpad>;

//   // All mints default to 6 decimal places.
//   const watermelonIdoAmount = new anchor.BN(5000000);

//   // These are all of the variables we assume exist in the world already and
//   // are available to the client.
//   let usdcMintAccount: Token;
//   let usdcMint: anchor.web3.PublicKey;
//   let watermelonMintAccount: Token;
//   let watermelonMint: anchor.web3.PublicKey;

//   let idoAuthorityUsdc: anchor.web3.PublicKey;
//   let idoAuthorityWatermelon: anchor.web3.PublicKey;

//   const usersAcc: anchor.web3.Keypair[] = [];
//   const NUM_USER = 10;
//   for (let i = 0; i < NUM_USER; i++) {
//     usersAcc.push(anchor.web3.Keypair.generate());
//   }

//   const leaves = usersAcc.map((acc) => hash(acc.publicKey.toBuffer()));

//   leaves.push(hash(program.provider.wallet.publicKey.toBuffer()));

//   const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

//   // sent to client
//   const rootHex = tree.getHexRoot();

//   const root = Buffer.from(rootHex.slice(2), "hex");

//   it("Initializes the state-of-the-world", async () => {
//     usdcMintAccount = await createMint(provider);
//     watermelonMintAccount = await createMint(provider);
//     usdcMint = usdcMintAccount.publicKey;
//     watermelonMint = watermelonMintAccount.publicKey;

//     idoAuthorityUsdc = await createTokenAccount(
//       provider,
//       usdcMint,
//       provider.wallet.publicKey
//     );

//     idoAuthorityWatermelon = await createTokenAccount(
//       provider,
//       watermelonMint,
//       provider.wallet.publicKey
//     );

//     await watermelonMintAccount.mintTo(
//       idoAuthorityWatermelon,
//       provider.wallet.publicKey,
//       [],
//       watermelonIdoAmount.toNumber()
//     );

//     const _idoAuthorityWatermelonAccount = await getTokenAccount(
//       provider,
//       idoAuthorityWatermelon
//     );

//     assert.ok(_idoAuthorityWatermelonAccount.amount.eq(watermelonIdoAmount));
//   });
//   // These are all variables the client will need to create in order to
//   // initialize the IDO pool
//   let idoTimes;
//   let idoName = faker.name.firstName().slice(0, 10);
//   it("Is initializes the IDO pool", async () => {
//     let bumps = new PoolBumps();

//     const [idoAccount, idoAccountBump] =
//       await anchor.web3.PublicKey.findProgramAddress(
//         [Buffer.from(idoName)],
//         program.programId
//       );

//     bumps.idoAccount = idoAccountBump;

//     const [redeemableMint, redeemableMintBump] =
//       await anchor.web3.PublicKey.findProgramAddress(
//         [Buffer.from(idoName), Buffer.from("redeemable_mint")],
//         program.programId
//       );
//     bumps.redeemableMint = redeemableMintBump;

//     const [poolWatermelon, poolWatermelonBump] =
//       await anchor.web3.PublicKey.findProgramAddress(
//         [Buffer.from(idoName), Buffer.from("pool_watermelon")],
//         program.programId
//       );
//     bumps.poolWatermelon = poolWatermelonBump;

//     const [poolUsdc, poolUsdcBump] =
//       await anchor.web3.PublicKey.findProgramAddress(
//         [Buffer.from(idoName), Buffer.from("pool_usdc")],
//         program.programId
//       );
//     bumps.poolUsdc = poolUsdcBump;
//     idoTimes = new IdoTimes();
//     const nowBn = new anchor.BN(Date.now() / 1000);
//     idoTimes.startIdo = nowBn.add(new anchor.BN(5));
//     idoTimes.endDeposits = nowBn.add(new anchor.BN(20));
//     idoTimes.endIdo = nowBn.add(new anchor.BN(25));
//     idoTimes.endEscrow = nowBn.add(new anchor.BN(26));

//     await program.rpc.initializePool(
//       idoName,
//       bumps,
//       watermelonIdoAmount,
//       idoTimes,
//       {
//         accounts: {
//           idoAuthority: provider.wallet.publicKey,
//           idoAuthorityWatermelon,
//           idoAccount,
//           watermelonMint,
//           usdcMint,
//           redeemableMint,
//           poolWatermelon,
//           poolUsdc,
//           systemProgram: anchor.web3.SystemProgram.programId,
//           tokenProgram: TOKEN_PROGRAM_ID,
//           rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//         },
//       }
//     );

//     const _idoAuthorityWatermelonAccount = await getTokenAccount(
//       provider,
//       idoAuthorityWatermelon
//     );

//     assert.ok(_idoAuthorityWatermelonAccount.amount.eq(new anchor.BN(0)));
//   });

//   it("Not allow ido authority to set merkle proof", async () => {
//     const attacker = anchor.web3.Keypair.generate();
//     const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName)],
//       program.programId
//     );
//     try {
//       await program.rpc.setPoolMerkleRoot([...root], {
//         accounts: {
//           idoAccount,
//           userAuthority: attacker.publicKey,
//         },
//         signers: [attacker],
//       });
//       assert.fail(
//         "it should not allow non ido authority to set pool merkle root"
//       );
//     } catch (e) {
//       assert.equal(e.msg, "Unauthorized");
//     }
//   });

//   it("Allow ido authority to set merkle proof", async () => {
//     const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName)],
//       program.programId
//     );

//     await program.rpc.setPoolMerkleRoot([...root], {
//       accounts: {
//         idoAccount,
//         userAuthority: program.provider.wallet.publicKey,
//       },
//     });

//     let idoAccountInfo = await program.account.idoAccount.fetch(idoAccount);
//     assert.equal(
//       Buffer.from(idoAccountInfo.merkleRoot).toString("hex"),
//       rootHex.slice(2)
//     );
//   });

//   let userUsdc: anchor.web3.PublicKey;
//   const firstDeposit = new anchor.BN(10_000_349);

//   it("Not allow non-whitelisted user to exchange USDC for redeemable tokens", async () => {
//     // Wait until the IDO has opened.
//     if (Date.now() < idoTimes.startIdo.toNumber() * 1000) {
//       await sleep(idoTimes.startIdo.toNumber() * 1000 - Date.now() + 2000);
//     }

//     const attacker = anchor.web3.Keypair.generate();

//     const [[idoAccount], [redeemableMint], [poolUsdc]] =
//       await findRelatedProgramAddress(idoName, program.programId);

//     const attackerUsdc = await createATA(
//       attacker,
//       usdcMint,
//       program.provider,
//       true
//     );

//     await usdcMintAccount.mintTo(
//       attackerUsdc,
//       program.provider.wallet.publicKey,
//       [],
//       firstDeposit.toNumber()
//     );

//     const _attackerUsdcAccount = await getTokenAccount(provider, attackerUsdc);
//     assert.ok(_attackerUsdcAccount.amount.eq(firstDeposit));

//     const [attackerRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
//       [
//         attacker.publicKey.toBuffer(),
//         Buffer.from(idoName),
//         Buffer.from("user_redeemable"),
//       ],
//       program.programId
//     );

//     const proof = getProof(tree, program.provider.wallet.publicKey);

//     try {
//       await program.rpc.exchangeUsdcForRedeemable(firstDeposit, proof, {
//         accounts: {
//           userAuthority: attacker.publicKey,
//           userUsdc: attackerUsdc,
//           userRedeemable: attackerRedeemable,
//           idoAccount,
//           usdcMint,
//           redeemableMint,
//           poolUsdc,
//           tokenProgram: TOKEN_PROGRAM_ID,
//         },
//         instructions: [
//           program.instruction.initUserRedeemable({
//             accounts: {
//               userAuthority: attacker.publicKey,
//               userRedeemable: attackerRedeemable,
//               idoAccount,
//               redeemableMint,
//               systemProgram: anchor.web3.SystemProgram.programId,
//               tokenProgram: TOKEN_PROGRAM_ID,
//               rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             },
//             signers: [attacker],
//           }),
//         ],
//         signers: [attacker],
//       });
//       assert.fail("it should not allow");
//     } catch (e) {
//       assert.equal(e.msg, "Given proof is invalid");
//     }
//   });

//   it("Exchanges user USDC for redeemable tokens", async () => {
//     const [[idoAccount], [redeemableMint], [poolUsdc]] =
//       await findRelatedProgramAddress(idoName, program.programId);

//     userUsdc = await createATA(
//       program.provider.wallet,
//       usdcMint,
//       program.provider
//     );

//     await usdcMintAccount.mintTo(
//       userUsdc,
//       provider.wallet.publicKey,
//       [],
//       firstDeposit.toNumber()
//     );

//     const _userUsdcAccount = await getTokenAccount(provider, userUsdc);
//     assert.ok(_userUsdcAccount.amount.eq(firstDeposit));

//     const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
//       [
//         provider.wallet.publicKey.toBuffer(),
//         Buffer.from(idoName),
//         Buffer.from("user_redeemable"),
//       ],
//       program.programId
//     );
//     const proof = getProof(tree, program.provider.wallet.publicKey);
//     const tx = await program.rpc.exchangeUsdcForRedeemable(
//       firstDeposit,
//       proof,
//       {
//         accounts: {
//           userAuthority: provider.wallet.publicKey,
//           userUsdc,
//           userRedeemable,
//           idoAccount,
//           usdcMint,
//           redeemableMint,
//           poolUsdc,
//           tokenProgram: TOKEN_PROGRAM_ID,
//         },
//         instructions: [
//           program.instruction.initUserRedeemable({
//             accounts: {
//               userAuthority: provider.wallet.publicKey,
//               userRedeemable,
//               idoAccount,
//               redeemableMint,
//               systemProgram: anchor.web3.SystemProgram.programId,
//               tokenProgram: TOKEN_PROGRAM_ID,
//               rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             },
//           }),
//         ],
//       }
//     );

//     const _poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
//     assert.ok(_poolUsdcAccount.amount.eq(firstDeposit));
//     const _userRedeemableAccount = await getTokenAccount(
//       provider,
//       userRedeemable
//     );
//     assert.ok(_userRedeemableAccount.amount.eq(firstDeposit));
//   });

//   const secondDeposit = new anchor.BN(23_000_672);
//   let totalPoolUsdc,
//     secondUserKeypair: anchor.web3.Keypair,
//     secondUserUsdc: anchor.web3.PublicKey;

//   it("Exchanges a second users USDC for redeemable tokens", async () => {
//     const [[idoAccount], [redeemableMint], [poolUsdc]] =
//       await findRelatedProgramAddress(idoName, program.programId);
//     secondUserKeypair = usersAcc[2];

//     secondUserUsdc = await createATA(
//       secondUserKeypair,
//       usdcMint,
//       program.provider,
//       true
//     );

//     await usdcMintAccount.mintTo(
//       secondUserUsdc,
//       provider.wallet.publicKey,
//       [],
//       secondDeposit.toNumber()
//     );

//     let _secondUserUsdc = await getTokenAccount(provider, secondUserUsdc);
//     assert.ok(_secondUserUsdc.amount.eq(secondDeposit));

//     const [secondUserRedeemable] =
//       await anchor.web3.PublicKey.findProgramAddress(
//         [
//           secondUserKeypair.publicKey.toBuffer(),
//           Buffer.from(idoName),
//           Buffer.from("user_redeemable"),
//         ],
//         program.programId
//       );
//     const proof = getProof(tree, secondUserKeypair.publicKey);
//     const tx = await program.rpc.exchangeUsdcForRedeemable(
//       secondDeposit,
//       proof,
//       {
//         accounts: {
//           userAuthority: secondUserKeypair.publicKey,
//           userUsdc: secondUserUsdc,
//           userRedeemable: secondUserRedeemable,
//           idoAccount,
//           usdcMint,
//           redeemableMint,
//           poolUsdc,
//           tokenProgram: TOKEN_PROGRAM_ID,
//         },
//         signers: [secondUserKeypair],
//         preInstructions: [
//           program.instruction.initUserRedeemable({
//             accounts: {
//               userAuthority: secondUserKeypair.publicKey,
//               userRedeemable: secondUserRedeemable,
//               idoAccount,
//               redeemableMint,
//               systemProgram: anchor.web3.SystemProgram.programId,
//               tokenProgram: TOKEN_PROGRAM_ID,
//               rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//             },
//             signers: [secondUserKeypair],
//           }),
//         ],
//       }
//     );

//     _secondUserUsdc = await getTokenAccount(provider, secondUserUsdc);
//     assert.ok(_secondUserUsdc.amount.eq(new anchor.BN(0)));

//     let _secondUserRedeemable = await getTokenAccount(
//       provider,
//       secondUserRedeemable
//     );
//     assert.ok(_secondUserRedeemable.amount.eq(secondDeposit));

//     totalPoolUsdc = firstDeposit.add(secondDeposit);

//     let _poolUSDC = await getTokenAccount(provider, poolUsdc);

//     assert.ok(_poolUSDC.amount.eq(totalPoolUsdc));
//   });

//   const firstWithdrawal = new anchor.BN(2_000_000);
//   it("Exchanges user Redeemable tokens for USDC", async () => {
//     const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName)],
//       program.programId
//     );

//     const [redeemableMint] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName), Buffer.from("redeemable_mint")],
//       program.programId
//     );

//     const [poolUsdc] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName), Buffer.from("pool_usdc")],
//       program.programId
//     );

//     const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
//       [
//         provider.wallet.publicKey.toBuffer(),
//         Buffer.from(idoName),
//         Buffer.from("user_redeemable"),
//       ],
//       program.programId
//     );

//     const [escrowUsdc] = await anchor.web3.PublicKey.findProgramAddress(
//       [
//         provider.wallet.publicKey.toBuffer(),
//         Buffer.from(idoName),
//         Buffer.from("escrow_usdc"),
//       ],
//       program.programId
//     );

//     await program.rpc.exchangeRedeemableForUsdc(firstWithdrawal, {
//       accounts: {
//         userAuthority: provider.wallet.publicKey,
//         escrowUsdc: escrowUsdc,
//         userRedeemable,
//         idoAccount,
//         usdcMint,
//         watermelonMint,
//         redeemableMint,
//         poolUsdc,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       },
//       preInstructions: [
//         program.instruction.initEscrowUsdc({
//           accounts: {
//             userAuthority: provider.wallet.publicKey,
//             escrowUsdc,
//             idoAccount,
//             usdcMint,
//             systemProgram: anchor.web3.SystemProgram.programId,
//             tokenProgram: TOKEN_PROGRAM_ID,
//             rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//           },
//         }),
//       ],
//     });

//     totalPoolUsdc = totalPoolUsdc.sub(firstWithdrawal);
//     const _poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
//     assert.ok(_poolUsdcAccount.amount.eq(totalPoolUsdc));
//     const _escrowUsdcAccount = await getTokenAccount(provider, escrowUsdc);
//     assert.ok(_escrowUsdcAccount.amount.eq(firstWithdrawal));
//   });

//   it("Exchanges user Redeemable tokens for watermelon", async () => {
//     // Wait until the IDO has ended.
//     if (Date.now() < idoTimes.endIdo.toNumber() * 1000) {
//       await sleep(idoTimes.endIdo.toNumber() * 1000 - Date.now() + 3000);
//     }

//     const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName)],
//       program.programId
//     );

//     const [poolWatermelon] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName), Buffer.from("pool_watermelon")],
//       program.programId
//     );

//     const [redeemableMint] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName), Buffer.from("redeemable_mint")],
//       program.programId
//     );

//     const [userRedeemable] = await anchor.web3.PublicKey.findProgramAddress(
//       [
//         provider.wallet.publicKey.toBuffer(),
//         Buffer.from(idoName),
//         Buffer.from("user_redeemable"),
//       ],
//       program.programId
//     );

//     const firstUserRedeemable = firstDeposit.sub(firstWithdrawal);
//     // TODO we've been lazy here and not used an ATA as we did with USDC
//     const userWatermelon = await createTokenAccount(
//       provider,
//       watermelonMint,
//       provider.wallet.publicKey
//     );

//     await program.rpc.exchangeRedeemableForWatermelon(firstUserRedeemable, {
//       accounts: {
//         payer: provider.wallet.publicKey,
//         userAuthority: provider.wallet.publicKey,
//         userWatermelon,
//         userRedeemable,
//         idoAccount,
//         watermelonMint,
//         redeemableMint,
//         poolWatermelon,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       },
//     });

//     const _poolWatermelonAccount = await getTokenAccount(
//       provider,
//       poolWatermelon
//     );
//     let redeemedWatermelon = firstUserRedeemable
//       .mul(watermelonIdoAmount)
//       .div(totalPoolUsdc);
//     let remainingWatermelon = watermelonIdoAmount.sub(redeemedWatermelon);
//     assert.ok(_poolWatermelonAccount.amount.eq(remainingWatermelon));
//     const _userWatermelonAccount = await getTokenAccount(
//       provider,
//       userWatermelon
//     );
//     assert.ok(_userWatermelonAccount.amount.eq(redeemedWatermelon));
//   });

//   it("Exchanges second user's Redeemable tokens for watermelon", async () => {
//     const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName)],
//       program.programId
//     );

//     const [redeemableMint] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName), Buffer.from("redeemable_mint")],
//       program.programId
//     );

//     const [secondUserRedeemable] =
//       await anchor.web3.PublicKey.findProgramAddress(
//         [
//           secondUserKeypair.publicKey.toBuffer(),
//           Buffer.from(idoName),
//           Buffer.from("user_redeemable"),
//         ],
//         program.programId
//       );

//     const [poolWatermelon] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName), Buffer.from("pool_watermelon")],
//       program.programId
//     );

//     const _secondUserWatermelon = await createTokenAccount(
//       provider,
//       watermelonMint,
//       secondUserKeypair.publicKey
//     );

//     await program.rpc.exchangeRedeemableForWatermelon(secondDeposit, {
//       accounts: {
//         payer: provider.wallet.publicKey,
//         userAuthority: secondUserKeypair.publicKey,
//         userWatermelon: _secondUserWatermelon,
//         userRedeemable: secondUserRedeemable,
//         idoAccount,
//         watermelonMint,
//         redeemableMint,
//         poolWatermelon,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       },
//     });

//     const _poolWatermelonAccount = await getTokenAccount(
//       provider,
//       poolWatermelon
//     );
//     assert.ok(_poolWatermelonAccount.amount.eq(new anchor.BN(0)));
//   });

//   it("Withdraws total USDC from pool account", async () => {
//     const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName)],
//       program.programId
//     );

//     const [poolUsdc] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName), Buffer.from("pool_usdc")],
//       program.programId
//     );

//     await program.rpc.withdrawPoolUsdc({
//       accounts: {
//         idoAuthority: provider.wallet.publicKey,
//         idoAuthorityUsdc,
//         idoAccount,
//         usdcMint,
//         watermelonMint,
//         poolUsdc,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       },
//     });

//     const _poolUsdcAccount = await getTokenAccount(provider, poolUsdc);
//     assert.ok(_poolUsdcAccount.amount.eq(new anchor.BN(0)));
//     const _idoAuthorityUsdcAccount = await getTokenAccount(
//       provider,
//       idoAuthorityUsdc
//     );
//     assert.ok(_idoAuthorityUsdcAccount.amount.eq(totalPoolUsdc));
//   });

//   it("Withdraws USDC from the escrow account after waiting period is over", async () => {
//     // Wait until the escrow period is over.
//     if (Date.now() < idoTimes.endEscrow.toNumber() * 1000 + 1000) {
//       await sleep(idoTimes.endEscrow.toNumber() * 1000 - Date.now() + 4000);
//     }

//     const [idoAccount] = await anchor.web3.PublicKey.findProgramAddress(
//       [Buffer.from(idoName)],
//       program.programId
//     );

//     const [escrowUsdc] = await anchor.web3.PublicKey.findProgramAddress(
//       [
//         provider.wallet.publicKey.toBuffer(),
//         Buffer.from(idoName),
//         Buffer.from("escrow_usdc"),
//       ],
//       program.programId
//     );

//     await program.rpc.withdrawFromEscrow(firstWithdrawal, {
//       accounts: {
//         payer: provider.wallet.publicKey,
//         userAuthority: provider.wallet.publicKey,
//         userUsdc,
//         escrowUsdc,
//         idoAccount,
//         usdcMint,
//         tokenProgram: TOKEN_PROGRAM_ID,
//       },
//     });

//     const _userUsdcAccount = await getTokenAccount(provider, userUsdc);
//     assert.ok(_userUsdcAccount.amount.eq(firstWithdrawal));
//   });
//   function PoolBumps() {
//     this.idoAccount;
//     this.redeemableMint;
//     this.poolWatermelon;
//     this.poolUsdc;
//   }

//   function IdoTimes() {
//     this.startIdo;
//     this.endDeposts;
//     this.endIdo;
//     this.endEscrow;
//   }
// });
