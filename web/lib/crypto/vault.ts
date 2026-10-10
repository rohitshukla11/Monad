/** Browser-side access to the ciphertext store. Ids are opaque hashes; bodies are envelopes. */
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { b64u } from "./encoding";

/** Stable per (passkey, object name), unlinkable to the passkey without knowing its credential id. */
export function vaultId(credentialId: string, name: string): string {
  return b64u.encode(sha256(utf8ToBytes(`likeness:vault|${credentialId}|${name}`)));
}

export async function vaultPut(id: string, body: unknown): Promise<void> {
  const r = await fetch(`/api/vault/${id}`, { method: "PUT", body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `vault ${r.status}`);
}

export async function vaultGet<T>(id: string): Promise<T | null> {
  const r = await fetch(`/api/vault/${id}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`vault ${r.status}`);
  return (await r.json()) as T;
}
