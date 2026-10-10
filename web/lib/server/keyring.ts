import "server-only";
/**
 * The render service's per-licence keys. For each active licence the service holds an ephemeral
 * X25519 key pair in memory only (never written, never logged). The creator's browser unwraps their
 * reference-set data key with their passkey and re-wraps it to that public key (lib/crypto/release).
 *
 * The release is checked before it is accepted: the ciphertext it unlocks must be the reference set
 * whose hash the creator was attested with on chain, and every capture must match its digest. The
 * key pair is wiped as soon as the licence is not Active (revoked, expired or used up), and a restart
 * wipes everything; the creator then re-releases from their `likeness:licence:<id>` copy.
 */
import type { Address } from "viem";
import { b64u } from "@/lib/crypto/encoding";
import { openItem, referenceSetHash, type ReferenceSet } from "@/lib/crypto/envelope";
import { acceptRelease, newServiceKey, type Release } from "@/lib/crypto/release";
import { singleton } from "./chain";
import { readCreator, readLicence } from "./protocol";
import { assertCiphertext, getCiphertext } from "./store";

type Held = {
  licenceId: bigint;
  creator: Address;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  createdAt: number;
  release?: Release;
  set?: ReferenceSet;
  releasedAt?: number;
};

const held = singleton("keyring", () => new Map<string, Held>());

export class KeyringError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function wipe(id: string) {
  const h = held.get(id);
  if (!h) return;
  h.secretKey.fill(0);
  held.delete(id);
}

async function requireActive(licenceId: bigint) {
  const l = await readLicence(licenceId);
  if (!l) throw new KeyringError(404, "no such licence");
  if (l.status !== "Active") {
    wipe(licenceId.toString());
    throw new KeyringError(409, `licence is ${l.status}; its key has been dropped`);
  }
  return l;
}

/** The public half of this licence's service key, created on first use. */
export async function serviceKey(licenceId: bigint): Promise<{ publicKey: string; createdAt: number; released: boolean }> {
  const l = await requireActive(licenceId);
  const id = licenceId.toString();
  let h = held.get(id);
  if (!h) {
    const k = newServiceKey();
    h = { licenceId, creator: l.creator, secretKey: k.secretKey, publicKey: k.publicKey, createdAt: Date.now() };
    held.set(id, h);
  }
  return { publicKey: b64u.encode(h.publicKey), createdAt: h.createdAt, released: !!h.release };
}

/**
 * Accept the creator's release for a licence. `vaultKey` names the reference-set ciphertext in the
 * vault. Self-authenticating: only the holder of the creator's passkey can produce a release that
 * opens the attested reference set.
 */
export async function acceptLicenceRelease(licenceId: bigint, release: Release, vaultKey: string) {
  const l = await requireActive(licenceId);
  const h = held.get(licenceId.toString());
  if (!h) throw new KeyringError(409, "fetch this licence's service key first");
  if (release.licenceId !== licenceId.toString()) throw new KeyringError(400, "release is for another licence");

  const raw = await getCiphertext(vaultKey);
  if (!raw) throw new KeyringError(404, "reference set not found in the vault");
  const set = JSON.parse(raw) as ReferenceSet;
  assertCiphertext(set);
  const creator = await readCreator(l.creator);
  if (!creator) throw new KeyringError(409, "creator is not registered");
  if (set.creator !== l.creator) throw new KeyringError(422, "reference set belongs to another creator");
  if ((await referenceSetHash(set)) !== creator.referenceSetHash) throw new KeyringError(422, "reference set is not the one attested on chain");

  let dek: Uint8Array | undefined;
  try {
    dek = await acceptRelease(release, h.secretKey);
    for (let i = 0; i < set.items.length; i++) (await openItem(dek, set, i)).fill(0);
  } catch (e) {
    throw new KeyringError(422, `release does not open the reference set: ${(e as Error).message}`);
  } finally {
    dek?.fill(0);
  }
  Object.assign(h, { release, set, releasedAt: Date.now() });
  return { captures: set.items.length, releasedAt: h.releasedAt! };
}

/**
 * Decrypted reference images for one render. The caller must zero every buffer when done.
 * Re-checks the licence first, so a revoked licence's photos can never be opened again.
 */
export async function referenceImages(licenceId: bigint): Promise<Uint8Array[]> {
  await requireActive(licenceId);
  const h = held.get(licenceId.toString());
  if (!h?.release || !h.set) throw new KeyringError(409, "the creator has not released their reference photos for this licence yet");
  const dek = await acceptRelease(h.release, h.secretKey);
  try {
    return await Promise.all(h.set.items.map((_, i) => openItem(dek, h.set!, i)));
  } finally {
    dek.fill(0);
  }
}

export function releaseState(licenceId: bigint): { keyHeld: boolean; released: boolean; releasedAt?: number } {
  const h = held.get(licenceId.toString());
  return { keyHeld: !!h, released: !!h?.release, releasedAt: h?.releasedAt };
}

/** Drop the keys of every licence that is no longer Active. */
export async function sweep(): Promise<string[]> {
  const dropped: string[] = [];
  for (const [id] of held) {
    const l = await readLicence(BigInt(id));
    if (l?.status !== "Active") {
      wipe(id);
      dropped.push(id);
    }
  }
  return dropped;
}
