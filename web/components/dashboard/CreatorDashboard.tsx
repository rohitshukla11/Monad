"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { CreatorRegistryAbi } from "@/lib/abi/CreatorRegistry";
import { LicenseRegistryAbi } from "@/lib/abi/LicenseRegistry";
import { api, reason, write } from "@/lib/client/tx";
import { categoryLabels, regionLabels } from "@/lib/categories";
import { deployment } from "@/lib/deployment";
import { approvalTypedData, declineMessage, formatDuration, usdc, type Licence, type Terms, type Trust } from "@/lib/licensing";
import { toRequest } from "@/components/market/RequestLicence";
import { TermsEditor } from "@/components/TermsEditor";
import { Badge, Button, Card, fmtDate, H2, Note, StatusBadge, TrustBadge, Tx } from "@/components/ui";
import { useWallet } from "@/components/wallet/WalletProvider";
import { KeyRelease } from "./KeyRelease";
import { Verification } from "./Reverify";

type Json<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] };
type CreatorJson = { address: Address; trust: Trust; terms: Json<Terms>; active: boolean; suspended: boolean; referenceSetHash: Hex; verifiedAt: number; upgradedAt?: number; epoch: number; payout: Address };
type Row = Json<Licence> & {
  escrow: { deposited: string; paidToCreator: string; balance: string };
  release: { keyHeld: boolean; released: boolean };
};
type Req = { id: string; licensee: Address; state: string; request: Record<string, string | number>; brief: { brand: string; campaign: string; use: string } };

export function CreatorDashboard() {
  const { wallet } = useWallet();
  const [creator, setCreator] = useState<CreatorJson | null | undefined>(undefined);
  const [licences, setLicences] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!wallet) return;
    const c = await fetch(`/api/creators/${wallet.address}`, { cache: "no-store" });
    if (c.status === 404) return setCreator(null);
    setCreator((await c.json()).creator);
    const [l, r] = await Promise.all([
      api<{ licences: Row[] }>(`/api/licences?creator=${wallet.address}`),
      api<{ requests: Req[] }>(`/api/requests?creator=${wallet.address}`),
    ]);
    setLicences(l.licences);
    setRequests(r.requests.filter((x) => x.state === "pending"));
  }, [wallet]);
  useEffect(() => {
    load().catch((e) => setMsg(reason(e)));
  }, [load]);

  async function run(label: string, f: () => Promise<{ hash: string; ms: number } | void>) {
    setBusy(true);
    setMsg(label);
    try {
      const r = await f();
      setMsg(r ? <span>Done: <Tx hash={r.hash} ms={r.ms} /></span> : "Done.");
      await load();
    } catch (e) {
      setMsg(<span className="text-down">{reason(e)}</span>);
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) return null;
  if (creator === undefined) return <Card>Loading creator…</Card>;
  if (creator === null)
    return (
      <Card>
        <H2>Creator</H2>
        <p className="mt-2 text-muted">
          This wallet is not a registered creator. <Link className="text-blue" href="/onboard">Become one</Link>.
        </p>
      </Card>
    );

  const terms: Terms = { ...creator.terms, maxDuration: BigInt(creator.terms.maxDuration), pricePerRender: BigInt(creator.terms.pricePerRender) };
  const earned = licences.reduce((s, l) => s + BigInt(l.escrow.paidToCreator), 0n);
  const renders = licences.reduce((s, l) => s + Number(l.renderCount), 0);
  const active = licences.filter((l) => l.status === "Active").length;

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <H2>Creator</H2>
          <TrustBadge trust={creator.trust} />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Stat label="Earned (after fee)" value={`${usdc.format(earned)} USDC`} />
          <Stat label="Renders paid" value={String(renders)} />
          <Stat label="Active licences" value={String(active)} />
          <Stat label="Accepting new licences" value={creator.suspended ? "Suspended" : creator.active ? "Yes" : "Paused"} />
        </div>
        {creator.trust.level === "unverified-test" && <Note>Seeded test creator: no liveness or ID check was run. Never use it in a demo.</Note>}
      </Card>

      <Verification trust={creator.trust} verifiedAt={creator.verifiedAt} upgradedAt={creator.upgradedAt} referenceSetHash={creator.referenceSetHash} onChanged={load} />

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <H2>Your terms</H2>
          <div className="flex gap-2">
            <Button kind="secondary" disabled={busy} onClick={() => setEditing(!editing)}>
              {editing ? "Close" : "Edit terms"}
            </Button>
            <Button
              kind="secondary"
              disabled={busy || creator.suspended}
              onClick={() => run("Updating…", () => write(wallet, { address: deployment.CreatorRegistry!, abi: CreatorRegistryAbi, functionName: "setActive", args: [!creator.active] }))}
            >
              {creator.active ? "Pause new licences" : "Accept new licences"}
            </Button>
          </div>
        </div>
        {editing ? (
          <TermsEditor
            initial={terms}
            busy={busy}
            submitLabel="Save terms on chain"
            onSubmit={(t) => run("Saving terms…", () => write(wallet, { address: deployment.CreatorRegistry!, abi: CreatorRegistryAbi, functionName: "setTerms", args: [t] })).then(() => setEditing(false))}
          />
        ) : (
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5">
            <dt className="text-dim">Uses</dt>
            <dd>{categoryLabels(terms.categories).join(", ")}</dd>
            <dt className="text-dim">Regions</dt>
            <dd>{regionLabels(terms.regions).join(", ")}</dd>
            <dt className="text-dim">Price</dt>
            <dd className="tnum">{usdc.format(terms.pricePerRender)} USDC per render</dd>
            <dt className="text-dim">Limits</dt>
            <dd>
              {terms.maxRenders} renders, {formatDuration(terms.maxDuration)}
            </dd>
            <dt className="text-dim">Approval</dt>
            <dd>{terms.autoApprove ? "Automatic inside these terms" : "You sign each licence"}</dd>
          </dl>
        )}
      </Card>

      {requests.length > 0 && (
        <Card className="space-y-3">
          <H2>Requests waiting for you</H2>
          {requests.map((r) => {
            const req = toRequest(r.request);
            return (
              <div key={r.id} className="flex items-center justify-between rounded-card border border-line-soft px-4 py-3">
                <div>
                  <div className="font-semibold">
                    {r.brief.brand}: {r.brief.campaign}
                  </div>
                  <div className="text-xs text-muted">
                    {categoryLabels(req.category).join()} · {regionLabels(req.regions).join(", ")} · {formatDuration(req.duration)} · {req.renderCap} renders ·{" "}
                    {usdc.format(req.pricePerRender)} USDC each · “{r.brief.use}”
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run("Sign the approval in your wallet…", async () => {
                        const signature = await wallet.client.signTypedData({ account: wallet.client.account, ...approvalTypedData(deployment.chainId, deployment.LicenseRegistry!, req, r.licensee) });
                        await api(`/api/requests/${r.id}`, { method: "POST", body: JSON.stringify({ approve: true, signature }) });
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    kind="ghost"
                    disabled={busy}
                    onClick={() =>
                      run("Declining…", async () => {
                        const signature = await wallet.client.signMessage({ account: wallet.client.account, message: declineMessage(r.id) });
                        await api(`/api/requests/${r.id}`, { method: "POST", body: JSON.stringify({ approve: false, signature }) });
                      })
                    }
                  >
                    Decline
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <H2>Licences</H2>
          <Button
            kind="danger"
            disabled={busy || active === 0}
            onClick={() => {
              if (confirm("Revoke every licence you have issued? New renders stop at once and brands can take back unused escrow."))
                void run("Revoking all…", () => write(wallet, { address: deployment.CreatorRegistry!, abi: CreatorRegistryAbi, functionName: "revokeAll", args: [] }));
            }}
          >
            Revoke all
          </Button>
        </div>
        {licences.length === 0 && <Note tone="dim">No licences yet.</Note>}
        {licences.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-4 rounded-card border border-line-soft px-4 py-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-3">
                <span className="font-semibold">#{l.id}</span>
                <StatusBadge status={l.status} />
                {l.status === "Active" && (l.release.released ? <Badge tone="up">Photos released</Badge> : <Badge tone="warn">Photos not released: renders wait</Badge>)}
              </div>
              <div className="text-xs text-muted">
                {categoryLabels(l.category).join()} · {l.renderCount}/{l.renderCap} renders · earned {usdc.format(BigInt(l.escrow.paidToCreator))} USDC · ends {fmtDate(BigInt(l.end))} · brand{" "}
                <span className="font-mono">{l.licensee.slice(0, 8)}…</span>
              </div>
            </div>
            {l.status === "Active" && (
              <div className="flex items-center gap-2">
                <KeyRelease licenceId={BigInt(l.id)} referenceSetHash={creator.referenceSetHash} released={l.release.released} onDone={load} />
                <Button
                  kind="danger"
                  disabled={busy}
                  onClick={() => run(`Revoking #${l.id}…`, () => write(wallet, { address: deployment.LicenseRegistry!, abi: LicenseRegistryAbi, functionName: "revoke", args: [BigInt(l.id)] }))}
                >
                  Revoke
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>
      {msg && <div className="text-sm text-muted">{msg}</div>}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line-soft p-4">
      <div className="text-xs uppercase tracking-wider text-dim">{label}</div>
      <div className="tnum mt-1 font-display text-lg">{value}</div>
    </div>
  );
}
