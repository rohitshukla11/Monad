"use client";

/**
 * Creator onboarding, in order: consent → Didit (ID document 18+, liveness, selfie-to-ID face match)
 * → three guided photos, each matched to the Didit liveness selfie → terms → encrypt the photos under
 * the passkey-derived reference key and store the ciphertext → platform attestation →
 * CreatorRegistry.register from the creator's wallet.
 */
import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { CreatorRegistryAbi } from "@/lib/abi/CreatorRegistry";
import { actionMessage } from "@/lib/auth";
import { explorer } from "@/lib/chain";
import { api, reason, write } from "@/lib/client/tx";
import { referenceSetHash, sealReferenceSet, sha256Hex } from "@/lib/crypto/envelope";
import { namespaceKey } from "@/lib/crypto/passkey";
import { vaultId, vaultPut } from "@/lib/crypto/vault";
import { deployment } from "@/lib/deployment";
import type { Terms } from "@/lib/licensing";
import { STARTER_TERMS, TermsEditor } from "@/components/TermsEditor";
import { Card, H2, Note } from "@/components/ui";
import { useWallet } from "@/components/wallet/WalletProvider";
import { CaptureStep } from "./CaptureStep";
import { ConsentStep } from "./ConsentStep";
import { DiditStep } from "./DiditStep";

type Step = "start" | "consent" | "didit" | "captures" | "seal" | "done";

export function CreatorFlow() {
  const { wallet } = useWallet();
  const [step, setStep] = useState<Step>("start");
  const [captures, setCaptures] = useState<Uint8Array[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const say = (line: string) => setLog((l) => [...l, line]);
  const toDidit = useCallback(() => setStep("didit"), []);
  const toCaptures = useCallback(() => setStep("captures"), []);

  if (!wallet) return <Card>Sign in and create your wallet first.</Card>;
  if (!deployment.CreatorRegistry) return <Card>The contracts are not deployed yet, so registration is off.</Card>;
  const address = wallet.address;

  async function verify(shots: Uint8Array[]) {
    setError(null);
    say("Matching your photos to your liveness selfie…");
    try {
      const photos = (await Promise.all(shots.map(sha256Hex))).join(",");
      const message = actionMessage("verify reference photos", { wallet: address.toLowerCase(), photos });
      const auth = { message, signature: await wallet!.client.signMessage({ account: wallet!.client.account, message }) };
      const b64 = shots.map((s) => btoa(Array.from(s, (c) => String.fromCharCode(c)).join("")));
      const r = await api<{ scores: number[]; matcher: string }>("/api/captures/verify", { method: "POST", body: JSON.stringify({ address, captures: b64, auth }) });
      say(`Photo match (${r.matcher === "didit" ? "Didit 1:1 face match" : "local matcher on the Likeness server"}): ${r.scores.map((x) => x.toFixed(0)).join(" / ")}.`);
      setCaptures(shots);
      setStep("seal");
    } catch (e) {
      shots.forEach((s) => s.fill(0));
      setError(reason(e));
      setStep("captures");
    }
  }

  async function sealAndRegister(terms: Terms) {
    setError(null);
    try {
      say("Deriving your reference key from your passkey…");
      const key = await namespaceKey({ kind: "reference" });
      const set = await sealReferenceSet(key.kek, address, captures);
      captures.forEach((c) => c.fill(0));
      setCaptures([]);
      await vaultPut(vaultId(key.credentialId, `reference-set:${await referenceSetHash(set)}`), set);
      say("Photos encrypted in this browser; only ciphertext was stored.");

      const a = await api<{ attestation: Record<string, unknown> & { verifiedAt: string }; deadline: string; signature: Hex; provider: string; liveness: string; level: string; didit: { deleted: string } }>(
        "/api/attest",
        { method: "POST", body: JSON.stringify({ address, referenceSet: set }) },
      );
      say(`Attested: provider ${a.provider}, liveness ${a.liveness}, level ${a.level}. Didit session deletion: ${a.didit.deleted}.`);

      const attestation = { ...a.attestation, verifiedAt: BigInt(a.attestation.verifiedAt) } as never;
      const r = await write(wallet!, {
        address: deployment.CreatorRegistry!,
        abi: CreatorRegistryAbi,
        functionName: "register",
        args: [address, attestation, BigInt(a.deadline), a.signature, terms],
      });
      say(`Registered: ${explorer.tx(r.hash)} (confirmed in ${r.ms} ms)`);
      setStep("done");
    } catch (e) {
      setError(reason(e));
    }
  }

  return (
    <Card>
      <H2>Verify and register</H2>
      <div className="mt-6">
        {step === "start" && (
          <button onClick={() => setStep("consent")} className="rounded-full bg-text px-5 py-2.5 text-sm font-semibold text-ground">
            Start
          </button>
        )}
        {step === "consent" && <ConsentStep wallet={wallet} onDone={toDidit} />}
        {step === "didit" && <DiditStep address={address} onDone={toCaptures} />}
        {step === "captures" && <CaptureStep onDone={verify} />}
        {step === "seal" && (
          <div className="space-y-4">
            <p className="text-muted">Set the terms you offer. You can change them any time from your dashboard.</p>
            <TermsEditor initial={STARTER_TERMS} submitLabel="Encrypt my photos and register" onSubmit={sealAndRegister} />
          </div>
        )}
        {step === "done" && <Note tone="up">You are a registered, verified creator.</Note>}
      </div>
      {log.length > 0 && (
        <ol className="mt-6 space-y-1 break-all font-mono text-xs text-muted">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      )}
      {error && <p className="mt-4 text-sm text-down">{error}</p>}
    </Card>
  );
}
