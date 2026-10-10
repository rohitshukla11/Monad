"use client";
/**
 * Open the creator's own attested reference photos in this browser: derive the reference key from the
 * passkey (or the DEV key for a seeded test wallet), fetch the sealed set from the vault and decrypt it.
 * The caller must zero every returned buffer when done.
 */
import type { Hex } from "viem";
import { devNamespaceKey } from "@/lib/crypto/devkeys";
import { openItem, unwrapDek, type ReferenceSet } from "@/lib/crypto/envelope";
import type { Namespace } from "@/lib/crypto/namespaces";
import { namespaceKey } from "@/lib/crypto/passkey";
import { vaultGet, vaultId } from "@/lib/crypto/vault";
import type { ActiveWallet } from "@/components/wallet/WalletProvider";

export const keyFor = (wallet: ActiveWallet, ns: Namespace) => (wallet.devSecret ? devNamespaceKey(wallet.devSecret, ns) : namespaceKey(ns));

/** The sealed set and its decrypted DEK (for a release); zero `dek` after use. */
export async function openReferenceSet(wallet: ActiveWallet, referenceSetHash: Hex): Promise<{ set: ReferenceSet; dek: Uint8Array }> {
  const ref = await keyFor(wallet, { kind: "reference" });
  const set = await vaultGet<ReferenceSet>(vaultId(ref.credentialId, `reference-set:${referenceSetHash}`));
  if (!set) throw new Error("your reference photos are not in the vault for this passkey; use the passkey you registered with");
  return { set, dek: await unwrapDek(ref.kek, set) };
}

/** The three attested photos, decrypted, plus the sealed set they came from. */
export async function openReferencePhotos(wallet: ActiveWallet, referenceSetHash: Hex): Promise<{ set: ReferenceSet; photos: Uint8Array[] }> {
  const { set, dek } = await openReferenceSet(wallet, referenceSetHash);
  try {
    return { set, photos: await Promise.all(set.items.map((_, i) => openItem(dek, set, i))) };
  } finally {
    dek.fill(0);
  }
}

export const toB64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
