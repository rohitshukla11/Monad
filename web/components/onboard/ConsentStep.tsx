"use client";

/** Consent before any verification: shown in full, an unticked box, then signed by the wallet. */
import { useEffect, useState } from "react";
import { actionMessage } from "@/lib/auth";
import { api, reason } from "@/lib/client/tx";
import { CONSENT_POINTS, CONSENT_VERSION, DIDIT_LINKS, consentTextHash } from "@/lib/consent";
import { Button, Note } from "@/components/ui";
import type { ActiveWallet } from "@/components/wallet/WalletProvider";

/** `always`: ask again even if this wallet already consented (re-verification). */
export function ConsentStep({ wallet, onDone, always = false }: { wallet: ActiveWallet; onDone: () => void; always?: boolean }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (always) return;
    api<{ consented: boolean }>(`/api/consent?address=${wallet.address}`)
      .then((r) => r.consented && onDone())
      .catch(() => {});
  }, [wallet.address, onDone, always]);

  async function sign() {
    setBusy(true);
    setError(null);
    try {
      const message = actionMessage("consent to identity verification and likeness licensing", {
        wallet: wallet.address.toLowerCase(),
        version: CONSENT_VERSION,
        "text sha256": await consentTextHash(),
      });
      const signature = await wallet.client.signMessage({ account: wallet.client.account, message });
      await api("/api/consent", { method: "POST", body: JSON.stringify({ address: wallet.address, auth: { message, signature } }) });
      onDone();
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg">Before we verify you</h3>
      <ol className="list-decimal space-y-2 pl-5 text-muted">
        {CONSENT_POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <p className="text-xs text-dim">
        Didit&apos;s{" "}
        <a className="text-blue" href={DIDIT_LINKS.privacy} target="_blank" rel="noreferrer">
          verification privacy notice
        </a>{" "}
        and{" "}
        <a className="text-blue" href={DIDIT_LINKS.terms} target="_blank" rel="noreferrer">
          identity verification terms
        </a>
        . Consent version {CONSENT_VERSION}.
      </p>
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1" />
        <span>I agree, including to Didit processing my identity document and my face (biometric data) for this verification.</span>
      </label>
      <Button disabled={!checked || busy} onClick={sign}>
        Sign my consent
      </Button>
      {error && <Note tone="down">{error}</Note>}
    </div>
  );
}
