/**
 * Envelope encryption for the reference set. Each capture is encrypted under one random data key
 * (DEK, AES-256-GCM); the DEK is then wrapped under the creator's KEK for `likeness:reference`.
 * Only ciphertext, IVs and the wrapped DEK ever leave the browser.
 *
 * Every ciphertext is bound to its context with AES-GCM additional data, so a blob cannot be
 * swapped between creators, items or purposes without failing authentication.
 *
 * The manifest also carries sha256 of each plaintext capture. The attester signs only if those match
 * the captures it compared against the liveness reference image, and the render service re-checks
 * them after decryption, so a creator cannot pass liveness and then seal someone else's photos.
 */
import { b64u } from "./encoding";

const enc = new TextEncoder();

export type Sealed = { v: 1; iv: string; ct: string };

export type ReferenceSet = {
  v: 1;
  creator: string; // lower-case 0x address
  items: Sealed[]; // one per capture
  digests: string[]; // sha256 hex of each plaintext capture, in item order
  wrappedDek: Sealed; // DEK under the creator's reference KEK
};

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

const aad = {
  item: (creator: string, i: number) => enc.encode(`likeness:reference:item|${creator}|${i}`),
  dek: (creator: string) => enc.encode(`likeness:reference:dek|${creator}`),
};

export function newDek(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function importAes(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, usages);
}

export async function seal(key: CryptoKey, plaintext: Uint8Array, additionalData: Uint8Array): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return { v: 1, iv: b64u.encode(iv), ct: b64u.encode(new Uint8Array(ct)) };
}

export async function open(key: CryptoKey, sealed: Sealed, additionalData: Uint8Array): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64u.decode(sealed.iv), additionalData: additionalData as BufferSource },
    key,
    b64u.decode(sealed.ct),
  );
  return new Uint8Array(pt);
}

/** Encrypt captures for `creator` under a fresh DEK, and wrap that DEK under `kek`. */
export async function sealReferenceSet(
  kek: CryptoKey,
  creator: string,
  captures: Uint8Array[],
): Promise<ReferenceSet> {
  const who = creator.toLowerCase();
  const dek = newDek();
  try {
    const dekKey = await importAes(dek, ["encrypt"]);
    const items = await Promise.all(captures.map((c, i) => seal(dekKey, c, aad.item(who, i))));
    const digests = await Promise.all(captures.map(sha256Hex));
    return { v: 1, creator: who, items, digests, wrappedDek: await seal(kek, dek, aad.dek(who)) };
  } finally {
    dek.fill(0);
  }
}

/** Recover the raw DEK (for re-wrapping to a licence). The caller must zero it after use. */
export async function unwrapDek(kek: CryptoKey, set: ReferenceSet): Promise<Uint8Array> {
  return open(kek, set.wrappedDek, aad.dek(set.creator));
}

/** Decrypt one capture and check it against the attested digest. */
export async function openItem(dek: Uint8Array, set: ReferenceSet, i: number): Promise<Uint8Array> {
  const key = await importAes(dek, ["decrypt"]);
  const pt = await open(key, set.items[i], aad.item(set.creator, i));
  if ((await sha256Hex(pt)) !== set.digests[i]) throw new Error(`capture ${i} does not match its digest`);
  return pt;
}

export async function openReferenceSet(kek: CryptoKey, set: ReferenceSet): Promise<Uint8Array[]> {
  const dek = await unwrapDek(kek, set);
  try {
    return await Promise.all(set.items.map((_, i) => openItem(dek, set, i)));
  } finally {
    dek.fill(0);
  }
}

/** sha256 over the canonical ciphertext manifest: the `referenceSetHash` attested on chain. */
export async function referenceSetHash(set: ReferenceSet): Promise<`0x${string}`> {
  const canonical = JSON.stringify({
    v: set.v,
    creator: set.creator,
    items: set.items.map((s) => [s.iv, s.ct]),
    digests: set.digests,
    wrappedDek: [set.wrappedDek.iv, set.wrappedDek.ct],
  });
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(canonical)));
  return `0x${Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
