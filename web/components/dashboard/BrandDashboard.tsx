"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { erc20Abi, type Address } from "viem";
import { LicenseEscrowAbi } from "@/lib/abi/LicenseEscrow";
import { USDC } from "@/lib/chain";
import { api, browserPub, reason, write } from "@/lib/client/tx";
import { categoryLabels } from "@/lib/categories";
import { deployment } from "@/lib/deployment";
import { usdc, type Licence } from "@/lib/licensing";
import { Button, Card, fmtDate, H2, Note, StatusBadge, Tx, inputClass } from "@/components/ui";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Stat } from "./CreatorDashboard";
import { Delegation } from "./Delegation";
import { Renders } from "./Renders";

type Json<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] };
type Row = Json<Licence> & { escrow: { deposited: string; paidToCreator: string; fees: string; refunded: string; balance: string } };

export function BrandDashboard() {
  const { wallet } = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    const [l, b] = await Promise.all([
      api<{ licences: Row[] }>(`/api/licences?licensee=${wallet.address}`),
      browserPub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] }),
    ]);
    setRows(l.licences);
    setBalance(b);
  }, [wallet]);
  useEffect(() => {
    load().catch((e) => setMsg(reason(e)));
  }, [load]);
  if (!wallet) return null;

  async function deposit(id: string) {
    setBusy(true);
    try {
      const amount = usdc.parse(amounts[id] ?? "");
      const allowance = await browserPub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [wallet!.address, deployment.LicenseEscrow!] });
      if (allowance < amount) {
        setMsg("Approving USDC for the escrow…");
        await write(wallet!, { address: USDC, abi: erc20Abi, functionName: "approve", args: [deployment.LicenseEscrow! as Address, amount] });
      }
      setMsg("Depositing…");
      const r = await write(wallet!, { address: deployment.LicenseEscrow!, abi: LicenseEscrowAbi, functionName: "deposit", args: [BigInt(id), amount] });
      setMsg(<span>Deposited: <Tx {...r} /></span>);
      await load();
    } catch (e) {
      setMsg(<span className="text-down">{reason(e)}</span>);
    } finally {
      setBusy(false);
    }
  }

  async function refund(id: string) {
    setBusy(true);
    try {
      const r = await write(wallet!, { address: deployment.LicenseEscrow!, abi: LicenseEscrowAbi, functionName: "refund", args: [BigInt(id)] });
      setMsg(<span>Refunded: <Tx {...r} /></span>);
      await load();
    } catch (e) {
      setMsg(<span className="text-down">{reason(e)}</span>);
    } finally {
      setBusy(false);
    }
  }

  const inEscrow = rows.reduce((s, r) => s + BigInt(r.escrow.balance), 0n);
  const spent = rows.reduce((s, r) => s + BigInt(r.escrow.paidToCreator) + BigInt(r.escrow.fees), 0n);
  const renders = rows.reduce((s, r) => s + Number(r.renderCount), 0);

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <H2>Brand</H2>
        <div className="grid grid-cols-4 gap-4">
          <Stat label="Wallet USDC" value={balance === null ? "—" : `${usdc.format(balance)}`} />
          <Stat label="In escrow" value={`${usdc.format(inEscrow)} USDC`} />
          <Stat label="Spent on renders" value={`${usdc.format(spent)} USDC`} />
          <Stat label="Renders" value={String(renders)} />
        </div>
        {balance === 0n && (
          <Note>
            No testnet USDC in this wallet. Get some from Circle&apos;s faucet (faucet.circle.com, network Monad Testnet) to fund licences.
          </Note>
        )}
      </Card>
      <Delegation />
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <H2>Your licences</H2>
          <Link className="text-sm text-blue" href="/market">
            Find a creator →
          </Link>
        </div>
        {rows.length === 0 && <Note tone="dim">No licences yet.</Note>}
        {rows.map((l) => (
          <div key={l.id} className="space-y-2 rounded-card border border-line-soft px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-semibold">#{l.id}</span>
                <StatusBadge status={l.status} />
                <span className="text-xs text-muted">
                  {categoryLabels(l.category).join()} · {l.renderCount}/{l.renderCap} renders · {usdc.format(BigInt(l.pricePerRender))} USDC each · ends {fmtDate(BigInt(l.end))}
                </span>
              </div>
              <span className="tnum">escrow {usdc.format(BigInt(l.escrow.balance))} USDC</span>
            </div>
            <div className="flex items-center gap-3">
              {l.status === "Active" ? (
                <>
                  <input
                    className={`${inputClass} w-40`}
                    placeholder="USDC"
                    value={amounts[l.id] ?? usdc.format(BigInt(l.pricePerRender) * BigInt(l.renderCap - l.renderCount))}
                    onChange={(e) => setAmounts({ ...amounts, [l.id]: e.target.value })}
                  />
                  <Button kind="secondary" disabled={busy} onClick={() => deposit(l.id)}>
                    Deposit
                  </Button>
                  <Link className="text-sm text-blue" href={`/generate?licence=${l.id}`}>
                    Generate →
                  </Link>
                </>
              ) : BigInt(l.escrow.balance) > 0n ? (
                <Button kind="secondary" disabled={busy} onClick={() => refund(l.id)}>
                  Refund {usdc.format(BigInt(l.escrow.balance))} USDC
                </Button>
              ) : (
                <span className="text-xs text-dim">Closed{BigInt(l.escrow.refunded) > 0n ? ` · refunded ${usdc.format(BigInt(l.escrow.refunded))} USDC` : ""}</span>
              )}
            </div>
          </div>
        ))}
      </Card>
      <Renders />
      {msg && <div className="text-sm text-muted">{msg}</div>}
    </div>
  );
}
