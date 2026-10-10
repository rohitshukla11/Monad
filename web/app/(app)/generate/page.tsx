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
import { EmptyState, HeroHeadline, HeroLine, InlinePill, LimeCard, NoticePage, PageHero, Panel, Tile, pillClass } from "@/components/ds";
import { IconCheck, IconCross } from "@/components/ds/icons";
import { Badge, Button, Field, H2, Note, StatusBadge, Tx, inputClass } from "@/components/ui";
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
      <NoticePage
        title="Generate"
        action={
          <Link href="/onboard" className={pillClass("ink")}>
            Sign in
          </Link>
        }
      >
        Sign in, or pick a DEV wallet in the header, to generate under your licences.
      </NoticePage>
    );

  const active = licences.filter((l) => l.status === "Active");
  const selected = licences.find((l) => l.id === id);
  const left = selected ? selected.renderCap - selected.renderCount : 0;

  return (
    <>
      <PageHero>
        <HeroHeadline label={selected ? `Generate under licence ${selected.id}` : "Generate under a licence"}>
          <HeroLine>Generate</HeroLine>
          <HeroLine muted>
            under licence
            {selected && <InlinePill>#{selected.id}</InlinePill>}
          </HeroLine>
        </HeroHeadline>
        {selected && (
          <LimeCard label="This render">
            <span className="text-[15px] font-semibold">Each render pays the creator</span>
            <span className="tnum text-[clamp(32px,3.4vw,42px)] font-bold leading-none tracking-[-0.03em]">${usdc.format(BigInt(selected.pricePerRender))}</span>
            <span className="text-[15px]">
              USDC from escrow · {left} of {selected.renderCap} renders left · {usdc.format(BigInt(selected.escrow.balance))} USDC in escrow
            </span>
            <span className="mt-auto flex flex-wrap gap-2 pt-2">
              {categoryLabels(selected.category).map((c) => (
                <span key={c} className="inline-flex items-center rounded-full border border-ink/30 px-3 py-1.5 text-[13px] font-semibold">
                  {c}
                </span>
              ))}
            </span>
          </LimeCard>
        )}
      </PageHero>
      <Panel>
        {active.length === 0 && (
          <EmptyState
            title="No active licence for this wallet"
            action={
              <Link href="/market" className={pillClass("ink")}>
                Find a face
              </Link>
            }
          >
            Request a licence from a creator in the marketplace, fund its escrow, then come back here.
          </EmptyState>
        )}
        {active.length > 0 && (
          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Tile as="section">
              <h2 className="m-0 text-[19px] font-semibold">Brief</h2>
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
                <textarea
                  className={`${inputClass} min-h-32 rounded-[18px] py-3`}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Smiling in a sunlit cafe holding our ceramic cup, product shot"
                />
              </Field>
              {pre && (
                <Field label="Payment">
                  <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as "delegated" | "wallet")}>
                    <option value="delegated" disabled={!pre.delegation?.ready}>
                      Delegated, one click{pre.delegation ? ` (${pre.delegation.provider === "dev-local" ? "DEV delegation" : "Dynamic"})` : " (not set up)"}
                    </option>
                    <option value="wallet">Confirm payRender in my wallet</option>
                  </select>
                </Field>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <Button kind="ink" disabled={busy || !id || prompt.trim().length < 3} onClick={go}>
                  Generate{selected ? ` · ${usdc.format(BigInt(selected.pricePerRender))} USDC` : ""}
                </Button>
                {step && (
                  <span role="status" className="text-[15px] text-wait">
                    {step}
                  </span>
                )}
              </div>
              {error && <Note tone="down">{error}</Note>}
            </Tile>
            {selected && pre && (
              <section aria-labelledby="checks-title" className="on-dark flex flex-col gap-4 rounded-[26px] bg-ink p-6 text-white">
                <h2 id="checks-title" className="m-0 text-[19px] font-semibold">
                  Before you render
                </h2>
                <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15px]">
                  {pre.checks.map((c) => (
                    <Check key={c.name} ok={c.ok} name={c.name} detail={c.detail} />
                  ))}
                  <Check
                    ok={pre.release.released}
                    name="Reference photos released by the creator"
                    detail={pre.release.released ? undefined : "the creator must release them from their dashboard (keys live only in this server's memory)"}
                  />
                </ul>
                <dl className="m-0 grid grid-cols-[7.5rem_1fr] gap-y-2 border-t border-ink-line pt-4 text-[14px]">
                  <dt className="text-grey-dark">Renderer</dt>
                  <dd className="m-0">{pre.renderer.test ? <Badge tone="warn">TEST RENDER (no model key configured)</Badge> : pre.renderer.primary}</dd>
                  <dt className="text-grey-dark">Prompt filter</dt>
                  <dd className="m-0">{pre.llmFilter.startsWith("LLM filter not configured") ? <Badge tone="warn">{pre.llmFilter}</Badge> : pre.llmFilter}</dd>
                  <dt className="text-grey-dark">C2PA</dt>
                  <dd className="m-0">{pre.c2pa === "test certificate" ? <Badge tone="warn">Signed with a TEST certificate</Badge> : <Badge tone="down">missing</Badge>}</dd>
                </dl>
              </section>
            )}
          </div>
        )}
        {result && <RenderResult result={result} />}
        {selected && selected.status !== "Active" && <StatusBadge status={selected.status} />}
      </Panel>
    </>
  );
}

function Check({ ok, name, detail }: { ok: boolean; name: string; detail?: string }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? "bg-lime text-ink" : "bg-coral text-ink"}`}>
        {ok ? <IconCheck size={14} /> : <IconCross size={14} />}
      </span>
      <span className="min-w-0">
        <span className="sr-only">{ok ? "Passed: " : "Not passed: "}</span>
        {name}
        {detail && <span className="block break-all text-[13px] text-grey-dark">{detail}</span>}
      </span>
    </li>
  );
}

function RenderResult({ result: { record: r, attempts } }: { result: Result }) {
  return (
    <section aria-label="Your render" className="grid grid-cols-1 gap-8 rounded-[26px] bg-white p-6 md:grid-cols-2">
      <div>
        {r.download ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.download} alt={`Render ${r.renderIndex} under licence ${r.licenceId}`} className="w-full rounded-[22px]" />
        ) : (
          <Note>File held until payment is on chain.</Note>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <H2>
            Licence #{r.licenceId}, render {r.renderIndex}
          </H2>
          {r.test && <Badge tone="warn">TEST RENDER</Badge>}
        </div>
        <dl className="m-0 grid grid-cols-[8rem_1fr] gap-y-2 text-[15px]">
          <dt className="text-grey">Renderer</dt>
          <dd className="m-0">
            {r.provider} · {r.model}
          </dd>
          <dt className="text-grey">Asset hash</dt>
          <dd className="m-0 break-all font-mono text-[13px]">{r.assetHash}</dd>
          <dt className="text-grey">payRender</dt>
          <dd className="m-0">{r.tx ? <Tx hash={r.tx} ms={r.confirmMs} /> : "—"}</dd>
          <dt className="text-grey">Gas used</dt>
          <dd className="tnum m-0">{r.gasUsed ?? "—"}</dd>
          <dt className="text-grey">Paid by</dt>
          <dd className="m-0">{r.paidBy}</dd>
          <dt className="text-grey">Filter</dt>
          <dd className="m-0 text-[13px]">{r.filter.layers.map((l) => (l.ran ? l.name : l.note)).join(" · ")}</dd>
        </dl>
        {attempts && attempts.length > 1 && <Note tone="dim">Renderer attempts: {attempts.join(" → ")}</Note>}
        <div className="flex flex-wrap gap-3">
          {r.download && (
            <a className={pillClass("lime")} href={r.download} download>
              Download
            </a>
          )}
          <Link className={pillClass("outline")} href={`/verify?hash=${r.assetHash}`}>
            Verify this file
          </Link>
        </div>
      </div>
    </section>
  );
}
