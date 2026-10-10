/**
 * DEV ONLY. The seeded "unverified test creator" has no passkey, so its namespace keys come from a
 * 32-byte dev secret through the same construction a passkey PRF has (HMAC over the namespace salt,
 * like CTAP hmac-secret), then through the exact same HKDF as real keys. Everything downstream
 * (sealing the reference set, releasing it to a licence) is the production code path.
 * Never used for a real creator; the creator it belongs to is labelled unverified everywhere.
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { deriveKek, fingerprint } from "./keys";
import { prfSalt, type Namespace } from "./namespaces";
import type { NamespaceKey } from "./passkey";

export const DEV_CREDENTIAL_ID = "dev-unverified-test-creator";

export async function devNamespaceKey(devSecretHex: string, ns: Namespace): Promise<NamespaceKey> {
  const prf = hmac(sha256, hexToBytes(devSecretHex.replace(/^0x/, "")), prfSalt(ns));
  try {
    return { credentialId: DEV_CREDENTIAL_ID, kek: await deriveKek(prf), fingerprint: await fingerprint(prf) };
  } finally {
    prf.fill(0);
  }
}
