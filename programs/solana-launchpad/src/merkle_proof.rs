use anchor_lang::solana_program::keccak;

pub struct MerkleProof {}

impl MerkleProof {
  pub fn calc_leaf_hash(val: &[u8]) -> [u8; 32] {
    keccak::hash(val).0
  }

  pub fn verify(proof: Vec<[u8; 32]>, root: [u8; 32], leaf: [u8; 32]) -> bool {
    Self::process_proof(proof, leaf) == root
  }

  fn process_proof(proof: Vec<[u8; 32]>, leaf: [u8; 32]) -> [u8; 32] {
    let mut computed_hash = leaf;
    for proof_element in proof.into_iter() {
      if computed_hash <= proof_element {
        computed_hash = keccak::hashv(&[&computed_hash, &proof_element]).0;
      } else {
        computed_hash = keccak::hashv(&[&proof_element, &computed_hash]).0;
      }
    }
    computed_hash
  }
}
