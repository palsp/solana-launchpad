import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { SolanaLaunchpad } from '../target/types/solana_launchpad';

describe('solana-launchpad', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SolanaLaunchpad as Program<SolanaLaunchpad>;

  it('Is initialized!', async () => {
    // Add your test here.
    const tx = await program.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });
});
