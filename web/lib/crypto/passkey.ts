/**
 * The only place the app touches a passkey. Mera (@category-labs/mera 0.2.0,
 * https://mera.category.xyz/reference/) runs the WebAuthn PRF ceremony; we pass our own 32-byte
 * namespace salt and derive keys from the output. The wallet is Dynamic's, never this passkey's:
 * every key here is for encryption or derivation, not for signing transactions.
 *
 * Zero secrets are stored. The passkey is discoverable, so a second device with the same synced
 * passkey needs nothing from us to re-derive the same keys, not even the credential id.
 */
import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, type WebAuthnClient } from "@category-labs/mera";
import { fingerprint, deriveKek } from "./keys";
import { prfSalt, type Namespace } from "./namespaces";

export const RP_NAME = "Likeness";

/** The relying party is the host serving the app; keys differ per rpId, so it must stay fixed. */
export function rpId(): string {
  const configured = process.env.NEXT_PUBLIC_RP_ID;
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.hostname;
  throw new Error("NEXT_PUBLIC_RP_ID is not set");
}

export type NamespaceKey = { credentialId: string; kek: CryptoKey; fingerprint: string };

async function toKey(credentialId: string, prfOutput: Uint8Array): Promise<NamespaceKey> {
  try {
    return { credentialId, kek: await deriveKek(prfOutput), fingerprint: await fingerprint(prfOutput) };
  } finally {
    prfOutput.fill(0);
  }
}

/** Create the creator's passkey and derive their first namespace key in the same ceremony. */
export async function createPasskey(
  user: { name: string; displayName: string },
  ns: Namespace,
  webAuthnClient?: WebAuthnClient,
): Promise<NamespaceKey> {
  const r = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: RP_NAME },
    user,
    prfSalt: prfSalt(ns),
    webAuthnClient,
  });
  return toKey(r.credentialId, r.prfOutput);
}

/** Re-derive a namespace key on any device holding the passkey. One user-verification prompt. */
export async function namespaceKey(ns: Namespace, webAuthnClient?: WebAuthnClient): Promise<NamespaceKey> {
  const r = await getPasskeyPrfOutput({ rpId: rpId(), prfSalt: prfSalt(ns), webAuthnClient });
  return toKey(r.credentialId, r.prfOutput);
}
