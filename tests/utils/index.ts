import * as spl from "@solana/spl-token";
import { MerkleTree } from "merkletreejs";
import * as anchor from "@project-serum/anchor";
import * as serumCmn from "@project-serum/common";
import keccak256 from "keccak256";
import { Token, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Wallet } from "@project-serum/anchor/dist/cjs/provider";

export function sleep(ms: number) {
  console.log("Sleeping for", ms / 1000, "seconds");
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getTokenAccount(
  provider: serumCmn.Provider,
  addr: anchor.web3.PublicKey
) {
  return await serumCmn.getTokenAccount(provider, addr);
}

export function getMintInfo(
  provider: serumCmn.Provider,
  addr: anchor.web3.PublicKey
) {
  return serumCmn.getMintInfo(provider, addr);
}

export async function createMint(
  provider: serumCmn.Provider,
  authority?: anchor.web3.PublicKey
) {
  if (authority === undefined) {
    authority = provider.wallet.publicKey;
  }
  const mint = await spl.Token.createMint(
    provider.connection,
    // @ts-ignore
    provider.wallet.payer,
    authority,
    null,
    6,
    TOKEN_PROGRAM_ID
  );
  return mint;
}

export async function createTokenAccount(
  provider,
  mint: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey
) {
  const token = new spl.Token(
    provider.connection,
    mint,
    TOKEN_PROGRAM_ID,
    provider.wallet.payer
  );
  let vault = await token.createAccount(owner);
  return vault;
}

export function hash(value: string | number | anchor.BN | Buffer) {
  return keccak256(value);
}
export function getProof(tree: MerkleTree, addr: anchor.web3.PublicKey) {
  const leaf = hash(addr.toBuffer());

  return tree.getProof(leaf).map((p) => p.data);
}

type FindProgramAddress = [anchor.web3.PublicKey, number];

export async function findRelatedProgramAddress(
  idoName: string,
  programId: anchor.web3.PublicKey
): Promise<FindProgramAddress[]> {
  const ido = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(idoName)],
    programId
  );

  const redeemableMint = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(idoName), Buffer.from("redeemable_mint")],
    programId
  );

  const poolUsdc = await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from(idoName), Buffer.from("pool_usdc")],
    programId
  );

  return [ido, redeemableMint, poolUsdc];
}

export async function createATA(
  userKeypair: anchor.web3.Keypair | Wallet,
  mint: anchor.web3.PublicKey,
  provider: anchor.Provider,
  airdrop = false
) {
  const userATA = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    userKeypair.publicKey
  );

  const createATAIx = await Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    userATA,
    userKeypair.publicKey,
    userKeypair.publicKey
  );

  const createATATx = new anchor.web3.Transaction().add(createATAIx);

  if (airdrop) {
    await requestAirdrop(userKeypair.publicKey, provider);
  }

  const signers =
    userKeypair instanceof anchor.web3.Keypair ? [userKeypair] : [];
  await provider.send(createATATx, signers);
  return userATA;
}

export async function requestAirdrop(
  dest: anchor.web3.PublicKey,
  provider: anchor.Provider,
  amount = 100_000_000_000 // 100 SOL
) {
  const tx = await provider.connection.requestAirdrop(dest, amount);
  return provider.connection.confirmTransaction(tx);
}
