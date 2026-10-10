# How Likeness uses Mera: one passkey, many keys

**Bounty:** Mera, "One Passkey, Many Keys".

## In one paragraph (for the submission form)

Likeness uses Mera's PRF output as **encryption key material for a person's face**, never as a wallet.
A creator's reference photos are encrypted in their browser under a key derived from their passkey in
the `likeness:reference` namespace. When they approve a licence, their browser derives a separate key
in `likeness:licence:<id>` and re-wraps the photos' data key for that licence only. A third namespace,
`likeness:brand:<id>`, derives a different, stable identity per brand. Every salt is its own key domain.
Nothing secret is stored anywhere: the server holds only ciphertext and hashes, and the chain holds only
a hash of that ciphertext. The account is a Dynamic wallet, so the passkey's only jobs are encrypting,
releasing and deriving. A second device with the same synced passkey re-derives the same keys and
decrypts the same state live; this is a scripted beat in the demo.

## Namespaces

| Namespace (sha256 of the string is the 32-byte PRF salt) | Used for | Kind of work |
|---|---|---|
| `likeness:reference` | Key-encryption key (KEK) for the reference set's data key | Encryption |
| `likeness:licence:<id>` | KEK for a per-licence copy of the data key, so the creator can re-release in one click (built: [`KeyRelease.tsx`](../web/components/dashboard/KeyRelease.tsx)) | Encryption (capability) |
| `likeness:brand:<id>` | Seed for a per-brand creator identity, unlinkable across brands | Derivation |

The code is in [`web/lib/crypto/`](../web/lib/crypto).

- `namespaces.ts` builds the salts.
- `keys.ts` runs HKDF-SHA256 from the PRF output, with separate labels for the KEK, the public
  fingerprint and the brand seed.
- `envelope.ts` does AES-256-GCM envelope encryption bound to its context.
- `release.ts` does the X25519 release to the render service.
- `passkey.ts` is the only file that calls Mera.

## Encryption versus derivation

- **Encryption.** The captures are encrypted under a random data key (DEK). The DEK is wrapped under the
  KEK. The KEK is derived on demand and is a non-extractable WebCrypto key.
- **Release.** For each active licence, the browser unwraps the DEK and wraps it to the render
  service's per-licence X25519 public key (ephemeral ECDH, then HKDF, then AES-GCM, with the licence ID
  bound as additional data). The service keeps its private key in memory and drops it on revoke or
  expiry, when the contract also refuses renders.
- **Derivation.** The fingerprint and the brand identity seeds come from the PRF output under their own
  HKDF labels. No derived value can be turned back into another.

## Key release, as built

One button per active licence on the creator's dashboard, **Release photos to renderer**
([`KeyRelease.tsx`](../web/components/dashboard/KeyRelease.tsx)):

1. Derive the `likeness:licence:<id>` KEK with the passkey. If a copy of the data key is already
   stored under it (a re-release after a server restart), unwrap that and skip step 2.
2. Otherwise:
   1. Derive the `likeness:reference` KEK.
   2. Fetch the sealed reference set from the vault. Its ID is `vaultId(credentialId,
      "reference-set:" + referenceSetHash)`, and the hash is read from chain, so nothing needs to be
      remembered.
   3. Unwrap the DEK.
   4. Store a copy of it, wrapped under the licence KEK.
3. Fetch the service's ephemeral public key for this licence (`GET /api/licences/<id>/service-key`).
   The server creates it in memory on first request, and only for an Active licence.
4. Wrap the DEK to that key and post it (`POST /api/licences/<id>/release`), then zero the DEK.

The server ([`keyring.ts`](../web/lib/server/keyring.ts)) accepts a release only if it decrypts the
reference set whose hash the creator was attested with on chain, and only if every capture matches its
attested digest. So the release authenticates itself: only the holder of the creator's passkey can
produce one. The service never stores the DEK. For each render it re-derives it from the release,
decrypts the captures in memory, and zeroes everything afterwards. Revocation, expiry, exhaustion or a
restart drops the key pair.

**The seeded test creator.** It has no passkey. Its namespace keys come from a 32-byte dev secret
through the same construction a passkey PRF uses (HMAC over the namespace salt), then the same HKDF
([`devkeys.ts`](../web/lib/crypto/devkeys.ts)). Sealing and release then run the production code path.
It is labelled an unverified test creator everywhere.

## What is persisted, and where

| Item | Persisted? |
|---|---|
| PRF outputs, KEKs, DEKs | Never. They live in memory for one operation, and buffers are zeroed. |
| Captures (plaintext) | Never at rest. They live in browser memory only. |
| Ciphertext, IVs, wrapped DEK | The vault: `web/.data/vault` locally (`STORE_DRIVER=local`) or private Vercel Blob (`blob`). The server checks the shape and writes each object once. |
| Per-licence copy of the DEK | The vault, wrapped under the creator's `likeness:licence:<id>` KEK |
| Render service's per-licence key, released DEK | Process memory only; dropped on revoke, expiry or restart |
| Credential ID | Not stored. The passkey is discoverable, so a new device needs nothing from us. |
| On chain | `referenceSetHash` (a hash of the ciphertext manifest) and `livenessSessionHash` |

## The cross-device test

**Automated.** [`crypto.test.ts`](../web/lib/crypto/crypto.test.ts) uses a fake authenticator whose PRF is
`HMAC(credential secret, rpId ‖ salt)`. It checks that:

- a synced second device gets the same fingerprint and decrypts device A's reference set;
- a device without the passkey, a different passkey, a different namespace or a different rpId each
  fail.

**Live (demo beat).** Run this on the deployed domain, because keys are bound to the rpId:

1. On device A, sign in, create the passkey, and encrypt and store a note.
2. On device B, which has the same passkey through iCloud Keychain or Google Password Manager, choose
   "Use my existing passkey".
3. The fingerprints match, and "Fetch and decrypt" shows the note.

Not supported: Chrome's local profile authenticator, Bitwarden and Dashlane, which don't offer PRF
([Mera authenticator support](https://mera.category.xyz/authenticator-support/)).
