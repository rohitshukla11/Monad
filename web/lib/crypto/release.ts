/**
 * Licence-scoped key release. When a creator approves a licence, their browser unwraps the reference
 * DEK and re-wraps it twice:
 *
 *  1. to the render service's per-licence X25519 public key (ECIES: ephemeral X25519, HKDF-SHA256,
 *     AES-256-GCM), so the service can read the reference set for that licence only; the service
 *     keeps its private key in memory and drops it on revoke or expiry;
 *  2. under the creator's own KEK for `likeness:licence:<id>`, so the creator can re-release in one
 *     click (after a service restart) without touching the captures again.
 *
 * Both wrappings bind the licence id as AES-GCM additional data.
 */
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { b64u } from "./encoding";
import { open, seal, type Sealed } from "./envelope";

const enc = new TextEncoder();
const releaseAad = (licenceId: bigint) => enc.encode(`likeness:release|licence:${licenceId.toString(10)}`);

export type Release = { v: 1; licenceId: string; epk: string; sealed: Sealed };

async function ecdhKey(shared: Uint8Array, epk: Uint8Array, spk: Uint8Array, licenceId: bigint, usage: KeyUsage) {
  const okm = hkdf(sha256, shared, concatBytes(epk, spk), enc.encode(`likeness/release/v1|${licenceId}`), 32);
  try {
    return await crypto.subtle.importKey("raw", okm as BufferSource, { name: "AES-GCM" }, false, [usage]);
  } finally {
    okm.fill(0);
  }
}

/** Creator side: wrap `dek` to the service key for `licenceId`. */
export async function releaseToService(dek: Uint8Array, servicePublicKey: Uint8Array, licenceId: bigint): Promise<Release> {
  const { secretKey, publicKey: epk } = x25519.keygen();
  const shared = x25519.getSharedSecret(secretKey, servicePublicKey);
  try {
    const key = await ecdhKey(shared, epk, servicePublicKey, licenceId, "encrypt");
    const sealed = await seal(key, dek, releaseAad(licenceId));
    return { v: 1, licenceId: licenceId.toString(10), epk: b64u.encode(epk), sealed };
  } finally {
    secretKey.fill(0);
    shared.fill(0);
  }
}

/** Service side: recover the DEK with the in-memory licence key. */
export async function acceptRelease(release: Release, serviceSecretKey: Uint8Array): Promise<Uint8Array> {
  const licenceId = BigInt(release.licenceId);
  const epk = b64u.decode(release.epk);
  const spk = x25519.getPublicKey(serviceSecretKey);
  const shared = x25519.getSharedSecret(serviceSecretKey, epk);
  try {
    const key = await ecdhKey(shared, epk, spk, licenceId, "decrypt");
    return await open(key, release.sealed, releaseAad(licenceId));
  } finally {
    shared.fill(0);
  }
}

/** Creator side: keep a copy of the DEK under the licence namespace's own KEK. */
export async function wrapForLicence(dek: Uint8Array, licenceKek: CryptoKey, licenceId: bigint): Promise<Sealed> {
  return seal(licenceKek, dek, releaseAad(licenceId));
}

export async function unwrapForLicence(sealed: Sealed, licenceKek: CryptoKey, licenceId: bigint): Promise<Uint8Array> {
  return open(licenceKek, sealed, releaseAad(licenceId));
}

/** Service side: a fresh per-licence key pair, held in memory only. */
export function newServiceKey(): { secretKey: Uint8Array; publicKey: Uint8Array } {
  return x25519.keygen();
}
