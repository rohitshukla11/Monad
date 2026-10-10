/**
 * Key derivation from Mera PRF output. Mera exports no KDF, so we use WebCrypto HKDF-SHA256
 * (https://www.w3.org/TR/WebCryptoAPI/#hkdf) over the 32-byte PRF output.
 *
 * Every derived key is a non-extractable CryptoKey. Nothing here persists anything: the PRF output,
 * the KEK and the fingerprint live in memory for the length of one operation.
 */
import { b64u } from "./encoding";

const enc = new TextEncoder();

/** HKDF `info` labels. Each label is its own key, so a fingerprint can never be used as a KEK. */
export const INFO = {
  kek: "likeness/kek/v1",
  fingerprint: "likeness/fingerprint/v1",
  brandId: "likeness/brand-id/v1",
} as const;

async function hkdfBits(prfOutput: Uint8Array, info: string, bits: number): Promise<Uint8Array> {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
  const ikm = await crypto.subtle.importKey("raw", prfOutput as BufferSource, "HKDF", false, ["deriveBits"]);
  const out = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(info) },
    ikm,
    bits,
  );
  return new Uint8Array(out);
}

/** The key-encryption key for one namespace: AES-256-GCM, non-extractable, wrap/unwrap only. */
export async function deriveKek(prfOutput: Uint8Array): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", prfOutput as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(INFO.kek) },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * A short public fingerprint of a namespace's key material, for the cross-device demo: two devices
 * show the same fingerprint if and only if they derived the same KEK. Derived under its own HKDF
 * label, so it reveals nothing about the KEK.
 */
export async function fingerprint(prfOutput: Uint8Array): Promise<string> {
  const bits = await hkdfBits(prfOutput, INFO.fingerprint, 64);
  return b64u.encode(bits);
}

/** 32 bytes of seed for a per-brand secp256k1 identity (derivation only; not used as a wallet). */
export async function brandIdentitySeed(prfOutput: Uint8Array): Promise<Uint8Array> {
  return hkdfBits(prfOutput, INFO.brandId, 256);
}
