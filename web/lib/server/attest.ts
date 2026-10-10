import "server-only";
/**
 * The platform attester: signs the EIP-712 Attestation that CreatorRegistry.register verifies. It signs
 * only when, for this wallet:
 *   - the creator signed the current consent (app/api/consent);
 *   - Didit approved the session: ID document, liveness, selfie-to-ID face match, and an 18+ date of
 *     birth computed by us (lib/server/didit), read from Didit's server API, never the browser;
 *   - each of the three captures matched the liveness selfie (Didit 1:1 face match, lib/server/captures);
 *   - the reference set's plaintext digests equal the digests of exactly those captures.
 * Providers on chain (lib/verification): ageProvider "didit" or "didit-sandbox" (from the session's own
 * environment), livenessProvider "<that>:<method>" with the liveness method Didit actually ran. The attestation carries hashes only: of the ciphertext manifest and of
 * the Didit session id. Once signed, the Didit session is deleted (privacy_erasure).
 */
import { keccak256, stringToHex, toHex, type Address } from "viem";
import { signAttestation, type Attestation } from "@/lib/attestation";
import { CreatorRegistryAbi } from "@/lib/abi/CreatorRegistry";
import { referenceSetHash, type ReferenceSet } from "@/lib/crypto/envelope";
import { requireAddress } from "@/lib/deployment";
import { CONSENT_VERSION } from "@/lib/consent";
import { PROVIDERS } from "@/lib/licensing";
import { peekPassed, takePassed } from "./captures";
import { dbGet } from "./db";
import { LIVENESS_RANK, livenessMethodOf, livenessProviderName } from "@/lib/verification";
import { pub, serverChain } from "./chain";
import { readCreator } from "./protocol";
import { deleteSession, getIdentity, saveIdentity, verificationLevel } from "./didit";
import { loadKey } from "./keys";

export { attestationTypes, signAttestation, type Attestation } from "@/lib/attestation";

export class AttestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * mode "register": a new creator. mode "upgrade": an already registered creator re-verified at a
 * strictly stronger liveness level, with the same sealed reference set (same hash on chain); the
 * result goes to CreatorRegistry.updateAttestation. A downgrade or a same-level re-attestation is refused.
 */
export async function attest(address: Address, set: ReferenceSet, mode: "register" | "upgrade" = "register") {
  const key = loadKey("ATTESTER_KEY_FILE", "ATTESTER_PRIVATE_KEY");
  if (!key) throw new AttestError(503, "attester is not configured");
  const registry = requireAddress("CreatorRegistry");
  const who = address.toLowerCase();
  if (set.creator !== who) throw new AttestError(400, "reference set belongs to another wallet");

  const consent = await dbGet<{ version: string }>("consents", who);
  if (consent?.version !== CONSENT_VERSION) throw new AttestError(409, "sign the current creator consent first");
  const identity = await getIdentity(who);
  if (identity?.state !== "approved" || !identity.checks?.adult) throw new AttestError(409, "no approved, 18+ Didit verification for this wallet");
  if (identity.level !== verificationLevel()) throw new AttestError(409, `this wallet was verified at level ${identity.level}; the server now requires ${verificationLevel()}`);
  if (identity.environment === "unknown") throw new AttestError(409, "Didit did not say whether this was a live or sandbox session");

  const passed = await peekPassed(who);
  if (!passed || passed.sessionId !== identity.sessionId) throw new AttestError(409, "no matched reference photos for this wallet; take them again");
  if (set.digests.length !== passed.digests.length || set.digests.some((d, i) => d !== passed.digests[i]))
    throw new AttestError(422, "the encrypted reference set is not the set of photos that matched your liveness selfie");
  const newMethod = livenessMethodOf(identity.checks.livenessMethod);
  const onChain = await readCreator(address);
  if (mode === "register" && onChain) throw new AttestError(409, "already registered: use Re-verify at a higher level");
  if (mode === "upgrade") {
    if (!onChain) throw new AttestError(409, "not registered yet");
    if ((await referenceSetHash(set)) !== onChain.referenceSetHash) throw new AttestError(422, "an upgrade keeps the registered reference set; this is a different set");
    const current = onChain.trust.level === "verified" ? onChain.trust.livenessMethod : "unknown";
    if (LIVENESS_RANK[newMethod] <= LIVENESS_RANK[current])
      throw new AttestError(409, `not an upgrade: the new verification used ${newMethod} liveness and the current attestation has ${current}`);
  }
  await takePassed(who); // consume only once every check has passed

  // The server's own chain (a local fork in tests and the demo), so the nonce matches the one that verifies.
  const nonce = await pub().readContract({ address: registry, abi: CreatorRegistryAbi, functionName: "attestationNonce", args: [address] });

  const sandbox = identity.environment === "sandbox";
  const provider = sandbox ? PROVIDERS.diditSandbox : PROVIDERS.didit;
  // The liveness Didit actually ran, not the one the workflow asked for.
  const liveness = livenessProviderName(sandbox, newMethod);
  const attestation: Attestation = {
    referenceSetHash: await referenceSetHash(set),
    livenessSessionHash: keccak256(toHex(identity.sessionId)),
    livenessProvider: stringToHex(liveness, { size: 32 }),
    ageProvider: stringToHex(provider, { size: 32 }),
    verifiedAt: BigInt(Math.floor((identity.decidedAt ?? Date.now()) / 1000)),
    adult: true,
  };
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
  const signature = await signAttestation(key, registry, serverChain().id, address, attestation, nonce, deadline);

  // Nothing further is needed from Didit: ask it to erase the session and its biometric data.
  identity.deletedFromDidit = await deleteSession(identity.sessionId);
  await saveIdentity(identity);
  return { attestation, deadline, signature, provider, liveness, level: identity.level, mode, didit: { deleted: identity.deletedFromDidit } };
}
