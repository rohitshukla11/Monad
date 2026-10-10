"use client";

/**
 * Generate under a licence. Shows every check before the button, which renderer and prompt filter
 * will run (and when they are test stand-ins), then renders, embeds the C2PA manifest and pays the
 * creator in one payRender transaction, either delegated (one click) or from the brand's wallet.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import { LicenseEscrowAbi } from "@/lib/abi/LicenseEscrow";
import { actionMessage } from "@/lib/auth";
import { api, reason, write } from "@/lib/client/tx";
import { categoryLabels } from "@/lib/categories";
import { deployment } from "@/lib/deployment";
import { usdc, type Licence } from "@/lib/licensing";
import { Badge, Button, Card, Field, H2, Note, StatusBadge, Tx, inputClass } from "@/components/ui";
import { useWallet } from "@/components/wallet/WalletProvider";

type Json<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] };
type Row = Json<Licence> & { escrow: { balance: string } };
type Pre = {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  release: { released: boolean };
  renderer: { primary: string; test: boolean };
  llmFilter: string;
  delegation: { provider: string; capUsdc: string; spentUsdc: string; ready: boolean } | null;
  c2pa: string;
};
type Result = {
  record: {
    assetHash: Hex;
    licenceId: string;
    renderIndex: number;
    provider: string;
    model: string;
    test: boolean;
    tx?: Hex;
    gasUsed?: string;
    confirmMs?: number;
    paidBy?: string;
    download?: string;
    filter: { layers: { name: string; ran: boolean; note?: string }[] };
  };
  authorisation?: { licenceId: string; assetHash: Hex; agent: Hex; deadline: string; agentSig: Hex; renderIndex: number };
  attempts?: string[];
};

async function sha256Hex(text: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function GeneratePage() {
  return (
    <Suspense>
      <Generate />
    </Suspense>
  );
}

function Generate() {
  const { wallet } = useWallet();
  const params = useSearchParams();
  const [licences, setLicences] = useState<Row[]>([]);
  const [id, setId] = useState<string>(params.get("licence") ?? "");
  const [prompt, setPrompt] = useState("");
  const [pre, setPre] = useState<Pre | null>(null);
  const [mode, setMode] = useState<"delegated" | "wallet">("delegated");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<React.ReactNode>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!wallet) return;
    api<{ licences: Row[] }>(`/api/licences?licensee=${wallet.address}`).then((j) => {
      setLicences(j.licences);
      if (!id && j.licences.find((l) => l.status === "Active")) setId(j.licences.find((l) => l.status === "Active")!.id);
    });
  }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = useCallback(
    async (withPrompt: boolean) => {
      if (!wallet || !id) return;
      const p = await api<Pre>("/api/generate/preflight", { method: "POST", body: JSON.stringify({ licenceId: id, licensee: wallet.address, prompt: withPrompt ? prompt : undefined }) });
      setPre(p);
      setMode(p.delegation?.ready ? "delegated" : "wallet");
      return p;
    },
    [wallet, id, prompt],
  );
  useEffect(() => {
    check(false).catch((e) => setError(reason(e)));
  }, [wallet, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setStep("Checking the prompt…");
      const p = await check(true);
      if (!p?.ok) throw new Error("A check failed; see the list.");
      setStep("Sign the render request in your wallet…");
      const message = actionMessage("render", { licence: id, "prompt sha256": await sha256Hex(prompt), mode });
      const auth = { message, signature: await wallet.client.signMessage({ account: wallet.client.account, message }) };
      setStep(mode === "delegated" ? "Rendering, signing the manifest, paying the creator…" : "Rendering and signing the manifest…");
      const r = await fetch("/api/generate", { method: "POST", body: JSON.stringify({ licenceId: id, prompt, mode, auth }), headers: { "content-type": "application/json" } });
      const j = await r.json();
      if (!r.ok) {
        const failed = (j.details?.checks as Pre["checks"] | undefined)?.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
        throw new Error(failed?.length ? failed.join(" · ") : j.error);
      }
      let res = j as Result;
      if (mode === "wallet" && res.authorisation) {
        const a = res.authorisation;
        setStep("Confirm payRender in your wallet: it pays the creator and anchors the receipt…");
        const sent = await write(wallet, {
          address: deployment.LicenseEscrow!,
          abi: LicenseEscrowAbi,
          functionName: "payRender",
          args: [BigInt(a.licenceId), a.assetHash, a.agent, BigInt(a.deadline), a.agentSig],
        });
        const record = await api<Result["record"]>(`/api/renders/${a.assetHash}/claim`, { method: "POST", body: JSON.stringify({ tx: sent.hash }) });
        res = { ...res, record: { ...record, tx: sent.hash, confirmMs: sent.ms, gasUsed: sent.receipt.gasUsed.toString() } };
      }
      setResult(res);
      setStep(null);
      await check(false);
    } catch (e) {
      setError(reason(e));
      setStep(null);
    } finally {
      setBusy(false);
    }
  }

  if (!wallet)
    return (
      <Card>
        <Note>Sign in, or pick a DEV wallet in the header, to generate under your licences.</Note>
      </Card>
    );

  const active = licences.filter((l) => l.status === "Active");
  const selected = licences.find((l) => l.id === id);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Generate</h1>
      {active.length === 0 && (
        <Note>
          No active licence for this wallet. <Link className="text-blue" href="/market">Get one in the marketplace</Link>.
        </Note>
      )}
      {active.length > 0 && (
        <Card className="space-y-5">
          <div className="grid grid-cols-[1fr_2fr] gap-4">
            <Field label="Licence">
              <select className={inputClass} value={id} onChange={(e) => setId(e.target.value)}>
                {active.map((l) => (
                  <option key={l.id} value={l.id}>
                    #{l.id} · {categoryLabels(l.category).join()} · {l.renderCount}/{l.renderCap} · {usdc.format(BigInt(l.pricePerRender))} USDC
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prompt" hint="Banned everywhere: political, adult, minors, impersonation, deception.">
              <textarea className="min-h-24 w-full rounded-card border border-line bg-surface px-4 py-3 text-sm" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Smiling in a sunlit cafe holding our ceramic cup, product shot" />
            </Field>
          </div>
          {selected && pre && (
            <div className="grid grid-cols-2 gap-6">
              <ul className="space-y-1.5">
                {pre.checks.map((c) => (
                  <li key={c.name} className="flex gap-2">
                    <span className={c.ok ? "text-up" : "text-down"}>{c.ok ? "✓" : "✗"}</span>
                    <span>
                      {c.name} <span className="text-xs text-dim">· {c.detail}</span>
                    </span>
                  </li>
                ))}
                <li className="flex gap-2">
                  <span className={pre.release.released ? "text-up" : "text-down"}>{pre.release.released ? "✓" : "✗"}</span>
                  <span>
                    Reference photos released by the creator{" "}
                    {!pre.release.released && <span className="text-xs text-dim">· the creator must release them from their dashboard (keys live only in this server&apos;s memory)</span>}
                  </span>
                </li>
              </ul>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5">
                <dt className="text-dim">Renderer</dt>
                <dd>
                  {pre.renderer.test ? <Badge tone="warn">TEST RENDER (no model key configured)</Badge> : pre.renderer.primary}
                </dd>
                <dt className="text-dim">Prompt filter</dt>
                <dd>{pre.llmFilter.startsWith("LLM filter not configured") ? <Badge tone="warn">{pre.llmFilter}</Badge> : pre.llmFilter}</dd>
                <dt className="text-dim">C2PA</dt>
                <dd>{pre.c2pa === "test certificate" ? <Badge tone="warn">Signed with a TEST certificate</Badge> : <Badge tone="down">missing</Badge>}</dd>
                <dt className="text-dim">Payment</dt>
                <dd className="space-y-1">
                  <select className={`${inputClass} w-auto`} value={mode} onChange={(e) => setMode(e.target.value as "delegated" | "wallet")}>
                    <option value="delegated" disabled={!pre.delegation?.ready}>
                      Delegated, one click{pre.delegation ? ` (${pre.delegation.provider === "dev-local" ? "DEV delegation" : "Dynamic"})` : " (not set up)"}
                    </option>
                    <option value="wallet">Confirm payRender in my wallet</option>
                  </select>
                </dd>
              </dl>
            </div>
          )}
          <div className="flex items-center gap-4">
            <Button disabled={busy || !id || prompt.trim().length < 3} onClick={go}>
              Generate · {selected ? `${usdc.format(BigInt(selected.pricePerRender))} USDC` : ""}
            </Button>
            {step && <span className="text-sm text-warn">{step}</span>}
          </div>
          {error && <Note tone="down">{error}</Note>}
        </Card>
      )}
      {result && <RenderResult result={result} />}
      {selected && selected.status !== "Active" && <StatusBadge status={selected.status} />}
    </div>
  );
}

function RenderResult({ result: { record: r, attempts } }: { result: Result }) {
  return (
    <Card className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
      <div>
        {r.download ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.download} alt={`Render ${r.renderIndex} under licence ${r.licenceId}`} className="w-full rounded-card" />
        ) : (
          <Note>File held until payment is on chain.</Note>
        )}
      </div>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <H2>
            Licence #{r.licenceId}, render {r.renderIndex}
          </H2>
          {r.test && <Badge tone="warn">TEST RENDER</Badge>}
        </div>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
          <dt className="text-dim">Renderer</dt>
          <dd>
            {r.provider} · {r.model}
          </dd>
          <dt className="text-dim">Asset hash</dt>
          <dd className="break-all font-mono text-xs">{r.assetHash}</dd>
          <dt className="text-dim">payRender</dt>
          <dd>{r.tx ? <Tx hash={r.tx} ms={r.confirmMs} /> : "—"}</dd>
          <dt className="text-dim">Gas used</dt>
          <dd className="tnum">{r.gasUsed ?? "—"}</dd>
          <dt className="text-dim">Paid by</dt>
          <dd>{r.paidBy}</dd>
          <dt className="text-dim">Filter</dt>
          <dd className="text-xs">{r.filter.layers.map((l) => (l.ran ? l.name : l.note)).join(" · ")}</dd>
        </dl>
        {attempts && attempts.length > 1 && <Note tone="dim">Renderer attempts: {attempts.join(" → ")}</Note>}
        <div className="flex gap-3">
          {r.download && (
            <a className="text-sm text-blue" href={r.download} download>
              Download
            </a>
          )}
          <Link className="text-sm text-blue" href={`/verify?hash=${r.assetHash}`}>
            Verify this file →
          </Link>
        </div>
      </div>
    </Card>
  );
}
