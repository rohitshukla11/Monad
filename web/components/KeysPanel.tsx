"use client";

/**
 * The cross-device demo beat for the Mera bounty. Device A creates the passkey, derives the
 * `likeness:reference` key and stores an encrypted note. Device B, with the same synced passkey,
 * derives the same key (same fingerprint) and decrypts the note live. Nothing secret is stored.
 */
import { pillClass } from "@/components/ds";
import { isMeraError } from "@category-labs/mera";
import { useState } from "react";
import { open, seal, type Sealed } from "@/lib/crypto/envelope";
import { createPasskey, namespaceKey, type NamespaceKey } from "@/lib/crypto/passkey";
import { vaultGet, vaultId, vaultPut } from "@/lib/crypto/vault";

const NOTE = "cross-device-note";
const aad = new TextEncoder().encode("likeness:reference:note");

function explain(e: unknown): string {
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE")
      return "This passkey provider has no PRF support. Use iCloud Keychain, Google Password Manager, 1Password or a YubiKey (not Chrome's local profile, Bitwarden or Dashlane).";
    if (e.code === "PASSKEY_OPERATION_FAILED") return "The passkey prompt was cancelled or failed.";
    return `${e.code}: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

export function KeysPanel() {
  const [key, setKey] = useState<NamespaceKey | null>(null);
  const [note, setNote] = useState("");
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(label: string, f: () => Promise<void>) {
    setBusy(true);
    setStatus(label);
    try {
      await f();
      setStatus(null);
    } catch (e) {
      setStatus(explain(e));
    } finally {
      setBusy(false);
    }
  }

  const create = () =>
    run("Creating your passkey…", async () =>
      setKey(await createPasskey({ name: "likeness-creator", displayName: "Likeness creator" }, { kind: "reference" })),
    );
  const derive = () => run("Waiting for your passkey…", async () => setKey(await namespaceKey({ kind: "reference" })));

  const store = () =>
    run("Encrypting…", async () => {
      if (!key) return;
      const sealed = await seal(key.kek, new TextEncoder().encode(note), aad);
      await vaultPut(vaultId(key.credentialId, NOTE), sealed);
      setStatus("Stored. Only ciphertext left this browser.");
    });

  const load = () =>
    run("Decrypting…", async () => {
      if (!key) return;
      const sealed = await vaultGet<Sealed>(vaultId(key.credentialId, NOTE));
      if (!sealed) throw new Error("No note stored for this passkey yet.");
      setDecrypted(new TextDecoder().decode(await open(key.kek, sealed, aad)));
    });

  return (
    <section className="rounded-[16px] border border-divider p-4">
      <h3 className="m-0 text-[18px] font-semibold">Your keys</h3>
      <p className="mt-2 max-w-2xl text-[14px] text-grey">
        Your face data is encrypted in this browser with a key derived from your passkey. We never see the key, and we
        store nothing that could rebuild it. Any device with the same synced passkey derives the same key.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={create} className={pillClass("ink")}>
          Create passkey
        </button>
        <button type="button" disabled={busy} onClick={derive} className={pillClass("outline")}>
          Use my existing passkey
        </button>
      </div>

      {key && (
        <div className="mt-6 space-y-5">
          <dl className="grid grid-cols-1 gap-y-2 text-[14px] sm:grid-cols-[10rem_1fr]">
            <dt className="text-dim">Namespace</dt>
            <dd className="font-mono">likeness:reference</dd>
            <dt className="text-dim">Key fingerprint</dt>
            <dd className="tnum font-mono text-ok">{key.fingerprint}</dd>
          </dl>
          <p className="text-[13px] text-grey">
            Open this page on a second device with the same passkey. The fingerprint will match, and it can decrypt the
            note below.
          </p>
          <div className="flex flex-wrap gap-3">
            <label htmlFor="keys-note" className="sr-only">
              A note to encrypt
            </label>
            <input
              id="keys-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A note to encrypt"
              className="min-h-11 w-full max-w-80 rounded-[14px] border border-field bg-white px-4 py-2 text-[15px]"
            />
            <button type="button" disabled={busy || !note} onClick={store} className={pillClass("outline")}>
              Encrypt and store
            </button>
            <button type="button" disabled={busy} onClick={load} className={pillClass("outline")}>
              Fetch and decrypt
            </button>
          </div>
          {decrypted !== null && (
            <p className="text-[14px]">
              Decrypted on this device: <span className="font-mono text-ok">{decrypted}</span>
            </p>
          )}
        </div>
      )}
      {status && <p role="status" className="mt-4 text-[14px] text-wait">{status}</p>}
    </section>
  );
}
