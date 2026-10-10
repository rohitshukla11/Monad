"use client";

/**
 * A brand requests a licence. Inside the creator's auto-approve terms it is issued on chain at once;
 * otherwise the exact request goes to the creator, who signs an EIP-712 Approval, and the brand then
 * submits it. Either way the contract checks every field again.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { parseEventLogs, type Address, type Hex } from "viem";
import { LicenseRegistryAbi } from "@/lib/abi/LicenseRegistry";
import { api, reason, write } from "@/lib/client/tx";
import { CATEGORIES, REGIONS } from "@/lib/categories";
import { deployment } from "@/lib/deployment";
import { fitsTerms, usdc, type LicenceRequest, type Terms } from "@/lib/licensing";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Badge, Button, Card, Field, H2, Note, Tx, inputClass } from "@/components/ui";

type TermsJson = Omit<Terms, "maxDuration" | "pricePerRender"> & { maxDuration: string; pricePerRender: string };
type Stored = { id: string; state: string; request: Record<string, string | number>; brief: { campaign: string }; signature?: Hex };

const randomSalt = () => `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;

export function toRequest(r: Record<string, string | number>): LicenceRequest {
  return {
    creator: r.creator as Address,
    category: Number(r.category),
    regions: Number(r.regions),
    duration: BigInt(r.duration),
    renderCap: Number(r.renderCap),
    pricePerRender: BigInt(r.pricePerRender),
    purposeHash: r.purposeHash as Hex,
    deadline: BigInt(r.deadline),
    salt: r.salt as Hex,
  };
}

export function issuedId(receipt: Parameters<typeof parseEventLogs>[0]["logs"]): bigint | null {
  const ev = parseEventLogs({ abi: LicenseRegistryAbi, logs: receipt, eventName: "LicenceIssued" })[0];
  return ev ? ev.args.id : null;
}

export function RequestLicence({ creator, terms: tj }: { creator: Address; terms: TermsJson }) {
  const terms: Terms = { ...tj, maxDuration: BigInt(tj.maxDuration), pricePerRender: BigInt(tj.pricePerRender) };
  const { wallet } = useWallet();
  const allowed = CATEGORIES.filter((c) => terms.categories & c.bit);
  const [category, setCategory] = useState<number>(allowed[0]?.bit ?? 0);
  const [regions, setRegions] = useState<number>(terms.regions & REGIONS.reduce((m, r) => m | r.bit, 0));
  const [days, setDays] = useState(Math.min(7, Number(terms.maxDuration / 86_400n)));
  const [cap, setCap] = useState(Math.min(10, terms.maxRenders));
  const [price, setPrice] = useState(usdc.format(terms.pricePerRender));
  const [brief, setBrief] = useState({ brand: "", campaign: "", use: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const [mine, setMine] = useState<Stored[]>([]);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    const j = await api<{ requests: Stored[] }>(`/api/requests?licensee=${wallet.address}&creator=${creator}`);
    setMine(j.requests);
  }, [wallet, creator]);
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  let parsedPrice = 0n;
  try {
    parsedPrice = usdc.parse(price);
  } catch {}
  const draft = { category, regions, duration: BigInt(days) * 86_400n, renderCap: cap, pricePerRender: parsedPrice };
  const outside = fitsTerms(terms, draft);

  async function issue(r: LicenceRequest, signature: Hex) {
    if (!wallet) return;
    const { hash, ms, receipt } = await write(wallet, { address: deployment.LicenseRegistry!, abi: LicenseRegistryAbi, functionName: "request", args: [r, signature] });
    const id = issuedId(receipt.logs);
    setMsg(
      <span>
        Licence #{id?.toString()} issued: <Tx hash={hash} ms={ms} />. Fund its escrow from your <Link className="text-blue" href="/dashboard">dashboard</Link>.
      </span>,
    );
  }

  async function submit() {
    if (!wallet) return;
    setBusy(true);
    setMsg(null);
    try {
      if (!outside) {
        const { purposeHash } = await api<{ purposeHash: Hex }>("/api/briefs", { method: "POST", body: JSON.stringify(brief) });
        await issue({ creator, ...draft, purposeHash, deadline: 0n, salt: randomSalt() }, "0x");
      } else {
        await api("/api/requests", {
          method: "POST",
          body: JSON.stringify({
            licensee: wallet.address,
            creator,
            category,
            regions,
            durationDays: days,
            renderCap: cap,
            pricePerRender: parsedPrice.toString(),
            brief,
          }),
        });
        setMsg("Sent to the creator for approval. It appears below once they sign.");
        await refresh();
      }
    } catch (e) {
      setMsg(<span className="text-down">{reason(e)}</span>);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-6">
      <H2>Request a licence</H2>
      {!wallet && <Note>Sign in (or pick a DEV wallet in the header) to request a licence.</Note>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Use">
          <select className={inputClass} value={category} onChange={(e) => setCategory(Number(e.target.value))}>
            {allowed.map((c) => (
              <option key={c.key} value={c.bit}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Regions">
          <div className="flex flex-wrap gap-2">
            {REGIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRegions(regions ^ r.bit)}
                className={`rounded-full border px-3 py-1 text-xs ${regions & r.bit ? "border-up/60 text-up" : "border-line text-dim"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Length (days)">
          <input className={inputClass} type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </Field>
        <Field label="Renders">
          <input className={inputClass} type="number" min={1} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
        </Field>
        <Field label="Price per render (USDC)">
          <input className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Brand">
          <input className={inputClass} value={brief.brand} onChange={(e) => setBrief({ ...brief, brand: e.target.value })} />
        </Field>
        <Field label="Campaign">
          <input className={inputClass} value={brief.campaign} onChange={(e) => setBrief({ ...brief, campaign: e.target.value })} />
        </Field>
        <Field label="Intended use" hint="Stored off chain; its hash goes on chain with the licence.">
          <input className={inputClass} value={brief.use} onChange={(e) => setBrief({ ...brief, use: e.target.value })} />
        </Field>
      </div>
      <div className="flex items-center gap-4">
        <Button onClick={submit} disabled={!wallet || busy || !regions || parsedPrice <= 0n}>
          {outside ? "Send to creator for approval" : "Get licence now (inside the creator's terms)"}
        </Button>
        {outside ? <Badge tone="warn">Needs the creator's signature: {outside}</Badge> : <Badge tone="up">Auto-approved on chain</Badge>}
      </div>
      {msg && <div className="text-sm text-muted">{msg}</div>}
      {mine.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-dim">Your requests to this creator</h3>
          {mine.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-card border border-line-soft px-4 py-2">
              <span>
                {r.brief.campaign} · {r.request.renderCap} renders · {usdc.format(BigInt(r.request.pricePerRender))} USDC
              </span>
              <span className="flex items-center gap-3">
                <Badge tone={r.state === "approved" ? "up" : r.state === "declined" ? "down" : "warn"}>{r.state}</Badge>
                {r.state === "approved" && r.signature && (
                  <Button kind="secondary" disabled={busy} onClick={() => issue(toRequest(r.request), r.signature!).catch((e) => setMsg(<span className="text-down">{reason(e)}</span>))}>
                    Issue licence on chain
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
