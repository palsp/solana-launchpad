import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { SolanaLaunchpad } from "../target/types/solana_launchpad";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import assert from "assert";

const hash = (value: string | number | anchor.BN | Buffer) => {
  return keccak256(value);
};

describe("solana-launchpad", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  // @ts-ignore
  const program = anchor.workspace.SolanaLaunchpad as Program<SolanaLaunchpad>;

  const usersAcc: anchor.web3.Keypair[] = [];
  const NUM_USER = 10;
  for (let i = 0; i < NUM_USER; i++) {
    usersAcc.push(anchor.web3.Keypair.generate());
  }

  const leaves = usersAcc.map((acc) => hash(acc.publicKey.toBuffer()));

  leaves.push(hash(program.provider.wallet.publicKey.toBuffer()));

  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

  const idoAcc = anchor.web3.Keypair.generate();

  // it("Is initialized!", async () => {
  //   // Add your test here.
  //   await program.rpc.initializePool({
  //     accounts: {
  //       idoAccount: idoAcc.publicKey,
  //       signer: program.provider.wallet.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     },
  //     signers: [idoAcc],
  //   });
  // });

  // it("can set proof", async () => {
  //   const rootHex = tree.getHexRoot();
  //   await program.rpc.setProof([...Buffer.from(rootHex.slice(2), "hex")], {
  //     accounts: {
  //       idoAccount: idoAcc.publicKey,
  //     },
  //   });
  // });

  // it("should allow whitelisted user to do something", async () => {
  //   const leaf = hash(program.provider.wallet.publicKey.toBuffer());
  //   // const proof = tree.getProof(leaf).map((p) => p.data);

  //   // sent to client
  //   const proof = tree
  //     .getHexProof(leaf)
  //     .map((p) => Buffer.from(p.slice(2), "hex"));

  //   await program.rpc.isWhitelisted(proof, {
  //     accounts: {
  //       idoAccount: idoAcc.publicKey,
  //       signer: program.provider.wallet.publicKey,
  //     },
  //   });
  // });

  // it("should reject not whitelisted user", async () => {
  //   const attacker = anchor.web3.Keypair.generate();
  //   const leaf = keccak256(attacker.publicKey.toBuffer());
  //   const proof = tree.getProof(leaf);
  //   try {
  //     await program.rpc.isWhitelisted(
  //       proof.map((p) => p.data),
  //       {
  //         accounts: {
  //           idoAccount: idoAcc.publicKey,
  //           signer: attacker.publicKey,
  //         },
  //         signers: [attacker],
  //       }
  //     );
  //     assert.fail("attacker shouldn't be able to ... !");
  //   } catch (e) {
  //     assert.equal(e.msg, "invalid proof");
  //   }
  // });
});
