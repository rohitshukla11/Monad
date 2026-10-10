"use client";

/**
 * Re-verify at a higher level, for a registered creator. Consent again → a new Didit session at the
 * server's VERIFICATION_LEVEL → the three sealed reference photos, decrypted in this browser with the
 * passkey, re-checked against the new liveness selfie → an upgrade attestation (same reference set,
 * stronger liveness) → CreatorRegistry.updateAttestation. The server refuses anything that is not a
 * strict upgrade.
 */
import { useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import { CreatorRegistryAbi } from "@/lib/abi/CreatorRegistry";
import { actionMessage } from "@/lib/auth";
import { api, reason, write } from "@/lib/client/tx";
import { devNamespaceKey } from "@/lib/crypto/devkeys";
import { openReferenceSet, sha256Hex, type ReferenceSet } from "@/lib/crypto/envelope";
import { namespaceKey } from "@/lib/crypto/passkey";
import { vaultGet, vaultId } from "@/lib/crypto/vault";
import { deployment } from "@/lib/deployment";
import type { Trust } from "@/lib/licensing";
import { LEVEL_SUMMARY, LIVENESS_RANK, type VerificationLevel } from "@/lib/verification";
import { ConsentStep } from "@/components/onboard/ConsentStep";
import { DiditStep } from "@/components/onboard/DiditStep";
import { Badge, Button, Card, fmtDate, H2, Note, Tx } from "@/components/ui";
import { useWallet } from "@/components/wallet/WalletProvider";

const RANK_OF_LEVEL: Record<VerificationLevel, number> = { free: LIVENESS_RANK.passive, full: LIVENESS_RANK.active };

/** The level this server verifies new creators at, and whether a creator at `current` could upgrade to it. */
export function useServerLevel(current: Trust) {
  const [level, setLevel] = useState<VerificationLevel | null>(null);
  useEffect(() => {
    api<{ verificationLevel: VerificationLevel }>("/api/status")
      .then((s) => setLevel(s.verificationLevel))
      .catch(() => {});
  }, []);
  const method = current.level === "verified" ? current.livenessMethod : "unknown";
  return { level, canUpgrade: level !== null && RANK_OF_LEVEL[level] > LIVENESS_RANK[method] };
}

export function Verification({
  trust,
  verifiedAt,
  upgradedAt,
  referenceSetHash,
  onChanged,
}: {
  trust: Trust;
  verifiedAt: number;
  upgradedAt?: number;
  referenceSetHash: Hex;
  onChanged: () => void;
}) {
  const [serverLevel, setServerLevel] = useState<VerificationLevel | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api<{ verificationLevel: VerificationLevel }>("/api/status")
      .then((s) => setServerLevel(s.verificationLevel))
      .catch(() => {});
  }, []);

  const current = trust.level === "verified" ? trust.livenessMethod : "unknown";
  const canUpgrade = serverLevel !== null && RANK_OF_LEVEL[serverLevel] > LIVENESS_RANK[current];

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <H2>Verification</H2>
        {trust.level === "verified" ? (
          <Badge tone={current === "passive" ? "warn" : "up"}>{current === "passive" ? "free level: passive liveness" : "full level: active liveness"}</Badge>
        ) : (
          <Badge tone="warn">not verified by Didit</Badge>
        )}
      </div>
      <p className="text-muted">
        Verified {fmtDate(verifiedAt)}
        {upgradedAt ? ` · upgraded ${fmtDate(upgradedAt)}` : ""}. This server verifies new creators at level{" "}
        <span className="font-semibold">{serverLevel ?? "…"}</span>
        {serverLevel ? ` (${LEVEL_SUMMARY[serverLevel]})` : ""}.
      </p>
      {canUpgrade && !open && <Button onClick={() => setOpen(true)}>Re-verify at a higher level ({serverLevel})</Button>}
      {!canUpgrade && serverLevel && <Note tone="dim">No higher level is available on this server. Re-verification can only raise your level, never lower it.</Note>}
      {open && <ReverifyFlow referenceSetHash={referenceSetHash} onDone={onChanged} />}
    </Card>
  );
}

type Step = "consent" | "didit" | "recheck" | "done";

export function ReverifyFlow({ referenceSetHash, onDone }: { referenceSetHash: Hex; onDone: () => void }) {
  const { wallet } = useWallet();
  const [step, setStep] = useState<Step>("consent");
  const [log, setLog] = useState<React.ReactNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const say = (l: React.ReactNode) => setLog((x) => [...x, l]);
  const toDidit = useCallback(() => setStep("didit"), []);
  const toRecheck = useCallback(() => setStep("recheck"), []);
  if (!wallet) return null;

  async function recheckAndUpgrade() {
    setBusy(true);
    setError(null);
    let captures: Uint8Array[] = [];
    try {
      say("Opening your sealed reference photos with your passkey…");
      const key = wallet!.devSecret ? await devNamespaceKey(wallet!.devSecret, { kind: "reference" }) : await namespaceKey({ kind: "reference" });
      const set = await vaultGet<ReferenceSet>(vaultId(key.credentialId, `reference-set:${referenceSetHash}`));
      if (!set) throw new Error("your sealed reference set is not in the vault for this passkey");
      captures = await openReferenceSet(key.kek, set);

      say("Re-checking them against your new liveness selfie…");
      const photos = (await Promise.all(captures.map(sha256Hex))).join(",");
      const message = actionMessage("verify reference photos", { wallet: wallet!.address.toLowerCase(), photos });
      const auth = { message, signature: await wallet!.client.signMessage({ account: wallet!.client.account, message }) };
      const b64 = captures.map((s) => btoa(Array.from(s, (c) => String.fromCharCode(c)).join("")));
      const m = await api<{ scores: number[]; matcher: string }>("/api/captures/verify", { method: "POST", body: JSON.stringify({ address: wallet!.address, captures: b64, auth }) });
      say(`Photo match (${m.matcher === "didit" ? "Didit 1:1 face match" : "local matcher"}): ${m.scores.map((x) => x.toFixed(0)).join(" / ")}.`);

      const a = await api<{ attestation: Record<string, unknown> & { verifiedAt: string }; deadline: string; signature: Hex; liveness: string; level: string; didit: { deleted: string } }>(
        "/api/attest",
        { method: "POST", body: JSON.stringify({ address: wallet!.address, referenceSet: set, mode: "upgrade" }) },
      );
      say(`Upgrade attested: liveness ${a.liveness}, level ${a.level}. Didit session deletion: ${a.didit.deleted}.`);
      const r = await write(wallet!, {
        address: deployment.CreatorRegistry!,
        abi: CreatorRegistryAbi,
        functionName: "updateAttestation",
        args: [{ ...a.attestation, verifiedAt: BigInt(a.attestation.verifiedAt) } as never, BigInt(a.deadline), a.signature],
      });
      say(
        <span>
          Upgraded on chain: <Tx hash={r.hash} ms={r.ms} />
        </span>,
      );
      setStep("done");
      onDone();
    } catch (e) {
      setError(reason(e));
    } finally {
      captures.forEach((c) => c.fill(0));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-white p-6 text-ink">
      {step === "consent" && <ConsentStep wallet={wallet} onDone={toDidit} always />}
      {step === "didit" && <DiditStep address={wallet.address} onDone={toRecheck} />}
      {step === "recheck" && (
        <div className="space-y-3">
          <p className="text-muted">Your registered photos stay the same: they are decrypted here, checked against the new selfie, and never re-uploaded.</p>
          <Button disabled={busy} onClick={recheckAndUpgrade}>
            Re-check my photos and upgrade
          </Button>
        </div>
      )}
      {step === "done" && <Note tone="up">Your verification level is upgraded.</Note>}
      {log.length > 0 && (
        <ol className="space-y-1 break-all font-mono text-xs text-muted">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      )}
      {error && <Note tone="down">{error}</Note>}
    </div>
  );
}
