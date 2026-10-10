/**
 * CreatorRegistry's EIP-712 Attestation, shared by the platform attester (lib/server/attest) and the
 * dev seed (lib/dev/seed), which signs "dev-unverified" attestations only.
 */
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** Matches CreatorRegistry.ATTESTATION_TYPEHASH field for field. */
export const attestationTypes = {
  Attestation: [
    { name: "creator", type: "address" },
    { name: "referenceSetHash", type: "bytes32" },
    { name: "livenessSessionHash", type: "bytes32" },
    { name: "livenessProvider", type: "bytes32" },
    { name: "ageProvider", type: "bytes32" },
    { name: "verifiedAt", type: "uint64" },
    { name: "adult", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export type Attestation = {
  referenceSetHash: Hex;
  livenessSessionHash: Hex;
  livenessProvider: Hex;
  ageProvider: Hex;
  verifiedAt: bigint;
  adult: boolean;
};

/** EIP-712 signature over CreatorRegistry's Attestation struct, for `registry` on `chainId`. */
export function signAttestation(
  key: Hex,
  registry: Address,
  chainId: number,
  creator: Address,
  attestation: Attestation,
  nonce: bigint,
  deadline: bigint,
): Promise<Hex> {
  return privateKeyToAccount(key).signTypedData({
    domain: { name: "Likeness CreatorRegistry", version: "1", chainId, verifyingContract: registry },
    types: attestationTypes,
    primaryType: "Attestation",
    message: { creator, ...attestation, nonce, deadline },
  });
}

