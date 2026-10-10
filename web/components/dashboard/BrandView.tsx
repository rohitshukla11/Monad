"use client";

/** Brand dashboard: licences held, escrow, delegated payments and renders, in the same system as the creator view. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { erc20Abi, type Address } from "viem";
import { LicenseEscrowAbi } from "@/lib/abi/LicenseEscrow";
import { USDC } from "@/lib/chain";
import { api, browserPub, reason, write } from "@/lib/client/tx";
import { categoryLabels } from "@/lib/categories";
import { deployment } from "@/lib/deployment";
import { usdc, type Licence } from "@/lib/licensing";
import { useBrandCards, useProfiles } from "@/lib/client/profiles";
import { AppPage, BrandChip, btnClass, Card, CreatorFace, StatCard, StatusPill } from "@/components/ds";
import { IconSearch } from "@/components/ds/icons";
import { fmtDay, STATUS_LABEL, Tx } from "@/components/ui";
import type { ActiveWallet } from "@/components/wallet/WalletProvider";
import { Delegation } from "./Delegation";
import { LicenceTable } from "./LicenceTable";
import { Renders } from "./Renders";

type Json<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] };
type Row = Json<Licence> & { escrow: { deposited: string; paidToCreator: string; fees: string; refunded: string; balance: string } };
type Brief = { brand: string; campaign: string; use: string };

const money = (units: bigint) => `$${usdc.format(units)}`;
const pad = (id: string) => `#${id.padStart(4, "0")}`;

export function BrandView({ wallet, toggle }: { wallet: ActiveWallet; toggle?: React.ReactNode }) {
  const [rows, setRows] = useState<Row[]>([]);
  const faces = useProfiles(rows.map((r) => r.creator));
  const [briefs, setBriefs] = useState<Record<string, Brief | null>>({});
  const [balance, setBalance] = useState<bigint | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);

  const load = useCallback(async () => {
    const [l, b] = await Promise.all([
      api<{ licences: Row[] }>(`/api/licences?licensee=${wallet.address}`),
      browserPub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] }),
    ]);
    setRows(l.licences);
    setBalance(b);
    const d = await Promise.all(l.licences.map((x) => api<{ brief: Brief | null }>(`/api/licences/${x.id}`).then((j) => [x.id, j.brief] as const)));
    setBriefs(Object.fromEntries(d));
  }, [wallet.address]);
  useEffect(() => {
    load().catch((e) => setMsg(reason(e)));
  }, [load]);

  async function deposit(l: Row) {
    setBusy(true);
    try {
      const amount = usdc.parse(amounts[l.id] ?? suggested(l));
      const allowance = await browserPub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [wallet.address, deployment.LicenseEscrow!] });
      if (allowance < amount) {
        setMsg("Approving USDC for the escrow…");
        await write(wallet, { address: USDC, abi: erc20Abi, functionName: "approve", args: [deployment.LicenseEscrow! as Address, amount] });
      }
      setMsg("Depositing…");
      const r = await write(wallet, { address: deployment.LicenseEscrow!, abi: LicenseEscrowAbi, functionName: "deposit", args: [BigInt(l.id), amount] });
      setMsg(<span>Deposited: <Tx {...r} /></span>);
      await load();
    } catch (e) {
      setMsg(<span className="text-bad">{reason(e)}</span>);
    } finally {
      setBusy(false);
    }
  }

  async function refund(l: Row) {
    setBusy(true);
    try {
      const r = await write(wallet, { address: deployment.LicenseEscrow!, abi: LicenseEscrowAbi, functionName: "refund", args: [BigInt(l.id)] });
      setMsg(<span>Refunded: <Tx {...r} /></span>);
      await load();
    } catch (e) {
      setMsg(<span className="text-bad">{reason(e)}</span>);
    } finally {
      setBusy(false);
    }
  }

  const inEscrow = rows.reduce((s, r) => s + BigInt(r.escrow.balance), 0n);
  const spent = rows.reduce((s, r) => s + BigInt(r.escrow.paidToCreator) + BigInt(r.escrow.fees), 0n);
  const renders = rows.reduce((s, r) => s + Number(r.renderCount), 0);
  const active = rows.filter((r) => r.status === "Active");

  return (
    <AppPage
      title="Dashboard"
      description="Your licences, escrow and renders."
      actions={
        <>
          {toggle}
          <Link href="/market" className={btnClass("lime")}>
            <IconSearch size={16} /> Find a creator
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="USDC balance" value={balance === null ? "…" : money(balance)} note="Circle USDC on Monad testnet" />
        <StatCard label="In escrow" value={money(inEscrow)} note="refundable once a licence ends" />
        <StatCard label="Spent on renders" value={money(spent)} note="creator payout plus the 10% fee" />
        <StatCard label="Renders" value={renders} note={`${active.length} active licence${active.length === 1 ? "" : "s"}`} />
      </div>
      {msg && (
        <div role="status" className="rounded-[16px] bg-white px-5 py-3 text-[14px]">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-[18px] desk:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Card title="Licences you hold">
            {rows.length === 0 ? (
              <p className="m-0 text-[14px] text-grey">No licences yet. Request one from a creator in the marketplace.</p>
            ) : (
              <LicenceTable
                caption="Licences you hold"
                rows={rows}
                rowKey={(l) => l.id}
                muted={(l) => l.status !== "Active"}
                columns={[
                  {
                    header: "Creator",
                    cell: (l) => (
                      <Link href={`/market/${l.creator}`} className="flex min-w-0 items-center gap-2.5 text-inherit no-underline">
                        <CreatorFace seed={l.creator} photo={faces[l.creator.toLowerCase()]?.photo} size={32} />
                        <span className="flex min-w-0 flex-col">
                          <span className="tnum truncate font-semibold">
                            {l.creator.slice(0, 6)}…{l.creator.slice(-4)} <span className="text-[12px] font-normal text-grey">{pad(l.id)}</span>
                          </span>
                          <span className="truncate text-[12px] text-grey">
                            {categoryLabels(l.category).join(", ")}
                            {briefs[l.id]?.campaign ? ` · “${briefs[l.id]!.campaign}”` : ""}
                          </span>
                        </span>
                      </Link>
                    ),
                  },
                  { header: "Status", cell: (l) => <StatusPill kind={l.status === "Active" ? "licensed" : l.status === "Revoked" ? "revoked" : "expired"}>{STATUS_LABEL[l.status]}</StatusPill> },
                  { header: "Renders", cell: (l) => `${l.renderCount} of ${l.renderCap}`, className: "tnum whitespace-nowrap" },
                  {
                    header: "Escrow left",
                    cell: (l) => (
                      <span className="flex flex-col">
                        <span className="font-semibold">{money(BigInt(l.escrow.balance))}</span>
                        <span className="text-[12px] text-grey">{l.status === "Active" ? `until ${fmtDay(BigInt(l.end))}` : BigInt(l.escrow.refunded) > 0n ? `refunded ${money(BigInt(l.escrow.refunded))}` : "closed"}</span>
                      </span>
                    ),
                    className: "tnum",
                  },
                ]}
                actions={(l) => {
                  const bal = BigInt(l.escrow.balance);
                  if (l.status === "Active")
                    return (
                      <>
                        <label className="sr-only" htmlFor={`dep-${l.id}`}>
                          Deposit for licence {pad(l.id)} (USDC)
                        </label>
                        <input
                          id={`dep-${l.id}`}
                          className="min-h-9 w-20 rounded-[10px] border border-field bg-white px-2 text-right text-[13px]"
                          inputMode="decimal"
                          value={amounts[l.id] ?? suggested(l)}
                          onChange={(e) => setAmounts({ ...amounts, [l.id]: e.target.value })}
                        />
                        <button type="button" disabled={busy} onClick={() => deposit(l)} className={btnClass("outline", "min-h-9 px-3 text-[13px]")}>
                          Deposit
                        </button>
                        <Link href={`/generate?licence=${l.id}`} className={btnClass("lime", "min-h-9 px-3 text-[13px]")}>
                          Generate
                        </Link>
                      </>
                    );
                  if (bal > 0n)
                    return (
                      <button type="button" disabled={busy} onClick={() => refund(l)} className={btnClass("ink", "min-h-9 px-3 text-[13px]")}>
                        Refund {money(bal)}
                      </button>
                    );
                  return <span className="text-[13px] text-grey">Closed</span>;
                }}
              />
            )}
          </Card>
          <Delegation />
          <Renders />
        </div>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <Funding address={wallet.address} empty={balance === 0n} />
          <BrandProfileCard address={wallet.address} />
        </div>
      </div>
    </AppPage>
  );
}

/** Where the brand's USDC comes from on testnet. */
function Funding({ address, empty }: { address: string; empty: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card title="Funding">
      <p className="m-0 text-[13px] text-grey">Send testnet USDC to this wallet, then deposit it into a licence&apos;s escrow.</p>
      <span className="tnum break-all rounded-[12px] bg-paper px-3 py-2 font-mono text-[12px]">{address}</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {}
          }}
          className={btnClass("outline")}
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy address"}</span>
        </button>
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className={btnClass(empty ? "ink" : "outline")}>
          USDC faucet<span className="sr-only"> (opens faucet.circle.com)</span>
        </a>
      </div>
      {empty && <p className="m-0 text-[13px] text-wait">No testnet USDC in this wallet yet. At faucet.circle.com pick Monad Testnet.</p>}
    </Card>
  );
}

function BrandProfileCard({ address }: { address: string }) {
  const card = useBrandCards([address])[address.toLowerCase()];
  return (
    <Card
      title="Brand profile"
      action={
        <Link href="/brand/onboard" className="min-h-11 content-center text-[13px] font-semibold underline underline-offset-2">
          {card ? "Edit" : "Set up"}
        </Link>
      }
    >
      {card ? (
        <>
          <BrandChip brand={card} />
          {card.website && <span className="break-all text-[13px] text-grey">{card.website}</span>}
        </>
      ) : (
        <p className="m-0 text-[13px] text-grey">No brand profile yet. Creators see your name, logo and domain check before they approve a licence.</p>
      )}
    </Card>
  );
}

function suggested(l: Row): string {
  return usdc.format(BigInt(l.pricePerRender) * BigInt(Math.max(0, l.renderCap - l.renderCount)));
}
