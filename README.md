# SOLANA LAUNCHPAD ⚓

A launchpad off-chain whitelist that can sell token on Solana Blockchain powered by Anchor Framework. This program is inspired by ido-pool example by [anchor framework](https://github.com/project-serum/anchor/tree/master/tests/ido-pool) and merkle whitelist by [@sayantank](https://github.com/sayantank/anchor-whitelist). 




## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)

- [Solana](https://docs.solana.com/cli/install-solana-cli-tools)

- [NodeJS](https://nodejs.org/en/)

## HOW TO RUN 

1. build and deploy to localnet
```sh
anchor build
anchor deploy
```

2. test the program
```sh
anchor test

# for apple silicon user
solana-test-validator --no-bpf-jit
anchor test --skip-local-validator
```




