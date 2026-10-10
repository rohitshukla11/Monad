"use client";

/**
 * Release a licence's reference photos to the render service. In this browser: derive the reference
 * key from the creator's passkey, unwrap the photos' data key, re-wrap it to the render service's
 * ephemeral key for this licence only, and keep a copy under the creator's `likeness:licence:<id>` key
 * so a later re-release needs no access to the reference set's own key. The data key never leaves the
 * browser unwrapped. (The seeded test creator derives the same keys from its dev secret instead.)
 */
import { useState } from "react";
import type { Hex } from "viem";
import { b64u } from "@/lib/crypto/encoding";
import { devNamespaceKey } from "@/lib/crypto/devkeys";
import { unwrapDek, type ReferenceSet, type Sealed } from "@/lib/crypto/envelope";
import type { Namespace } from "@/lib/crypto/namespaces";
import { namespaceKey } from "@/lib/crypto/passkey";
import { releaseToService, unwrapForLicence, wrapForLicence } from "@/lib/crypto/release";
import { vaultGet, vaultId, vaultPut } from "@/lib/crypto/vault";
import { api, reason } from "@/lib/client/tx";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Button } from "@/components/ui";

export function KeyRelease({ licenceId, referenceSetHash, released, onDone }: { licenceId: bigint; referenceSetHash: Hex; released: boolean; onDone: () => void }) {
  const { wallet } = useWallet();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const keyFor = (ns: Namespace) => (wallet?.devSecret ? devNamespaceKey(wallet.devSecret, ns) : namespaceKey(ns));

  async function release() {
    setBusy(true);
    let dek: Uint8Array | undefined;
    try {
      setStatus("Deriving your licence key…");
      const lic = await keyFor({ kind: "licence", licenceId });
      const backupId = vaultId(lic.credentialId, `licence-backup:${licenceId}`);
      const backup = await vaultGet<Sealed>(backupId);

      const ref = await keyFor({ kind: "reference" });
      const vaultKey = vaultId(ref.credentialId, `reference-set:${referenceSetHash}`);
      if (backup) {
        dek = await unwrapForLicence(backup, lic.kek, licenceId);
      } else {
        setStatus("Opening your reference set key…");
        const set = await vaultGet<ReferenceSet>(vaultKey);
        if (!set) throw new Error("your reference set is not in the vault for this passkey");
        dek = await unwrapDek(ref.kek, set);
        await vaultPut(backupId, await wrapForLicence(dek, lic.kek, licenceId));
      }

      setStatus("Wrapping it to the render service's key for this licence…");
      const { publicKey } = await api<{ publicKey: string }>(`/api/licences/${licenceId}/service-key`);
      const rel = await releaseToService(dek, b64u.decode(publicKey), licenceId);
      await api(`/api/licences/${licenceId}/release`, { method: "POST", body: JSON.stringify({ release: rel, vaultKey }) });
      setStatus("Released for this licence only.");
      onDone();
    } catch (e) {
      setStatus(reason(e));
    } finally {
      dek?.fill(0);
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-3">
      <Button kind="secondary" disabled={busy || !wallet} onClick={release}>
        {released ? "Re-release photos" : "Release photos to renderer"}
      </Button>
      {status && <span className="text-xs text-warn">{status}</span>}
    </span>
  );
}
