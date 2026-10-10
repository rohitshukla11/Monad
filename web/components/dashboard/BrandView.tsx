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
import { useProfiles } from "@/lib/client/profiles";
import { CreatorFace, HeroHeadline, HeroLine, InlinePill, LimeCard, Panel, pillClass, SectionTitle, StatCard, StatusPill } from "@/components/ds";
import { IconArrowRight, IconSearch } from "@/components/ds/icons";
import { fmtDay, Note, STATUS_LABEL, Tx, inputClass } from "@/components/ui";
import type { ActiveWallet } from "@/components/wallet/WalletProvider";
import { Delegation } from "./Delegation";
import { Renders } from "./Renders";

type Json<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] };
type Row = Json<Licence> & { escrow: { deposited: string; paidToCreator: string; fees: string; refunded: string; balance: string } };
type Brief = { brand: string; campaign: string; use: string };

const money = (units: bigint) => `$${usdc.format(units)}`;
const pad = (id: string) => `#${id.padStart(4, "0")}`;

export function BrandView({ wallet }: { wallet: ActiveWallet }) {
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
    <>
      <section className="on-dark mx-auto flex max-w-[1320px] flex-wrap items-stretch gap-10 px-4 pb-[84px] pt-7 text-white sm:px-8 sm:pt-9">
        <HeroHeadline label={`Your licences: ${active.length} active, ${money(spent)} spent on ${renders} renders`}>
          <HeroLine>
            Your licences
            <InlinePill>{active.length} active</InlinePill>
          </HeroLine>
          <HeroLine>spent {money(spent)}</HeroLine>
          <HeroLine muted>
            on {renders} render{renders === 1 ? "" : "s"}
          </HeroLine>
        </HeroHeadline>
        {active.length > 0 ? (
          <LimeCard label="Generate">
            <span className="self-start rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-lime">{money(inEscrow)} in escrow</span>
            <h2 className="m-0 text-[clamp(22px,2.4vw,28px)] font-bold leading-[1.1] tracking-[-0.02em]">Make your next render</h2>
            <p className="m-0 text-[15px] leading-relaxed">Each render pays the creator and anchors a receipt in one Monad transaction.</p>
            <Link href="/generate" className="mt-auto flex min-h-12 items-center justify-center gap-2 rounded-[18px] bg-ink px-5 text-[15px] font-semibold text-white no-underline">
              Generate <IconArrowRight size={18} stroke="#FFFFFF" />
            </Link>
          </LimeCard>
        ) : (
          <LimeCard label="Find a face">
            <span className="self-start rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-lime">No active licence</span>
            <h2 className="m-0 text-[clamp(22px,2.4vw,28px)] font-bold leading-[1.1] tracking-[-0.02em]">Find a face to license</h2>
            <p className="m-0 text-[15px] leading-relaxed">Every creator in the marketplace is a verified human who set their own terms.</p>
            <Link href="/market" className="mt-auto flex min-h-12 items-center justify-center gap-2 rounded-[18px] bg-ink px-5 text-[15px] font-semibold text-white no-underline">
              <IconSearch size={18} stroke="#FFFFFF" /> Marketplace
            </Link>
          </LimeCard>
        )}
      </section>

      <Panel>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="USDC in your wallet" value={balance === null ? "…" : money(balance)} note="Circle USDC on Monad testnet" />
          <StatCard label="In escrow" value={money(inEscrow)} note="refundable once a licence ends" />
          <StatCard label="Spent on renders" value={money(spent)} note="creator payout plus the 10% fee" />
          <StatCard label="Renders" value={renders} note="each with a receipt" />
        </div>
        {balance === 0n && <Note>No testnet USDC in this wallet. Get some at faucet.circle.com (network: Monad Testnet) to fund licences.</Note>}

        <SectionTitle
          action={
            <Link href="/market" className={pillClass("outline")}>
              Find a creator
            </Link>
          }
        >
          Licences you hold
        </SectionTitle>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.length === 0 && (
            <div className="flex flex-col gap-2 rounded-[26px] border-2 border-dashed border-field bg-white/60 p-6">
              <h3 className="m-0 text-lg font-semibold">No licences yet</h3>
              <p className="m-0 text-[15px] text-grey">Request one from a creator in the marketplace.</p>
            </div>
          )}
          {rows.map((l) => {
            const isActive = l.status === "Active";
            const bal = BigInt(l.escrow.balance);
            const brief = briefs[l.id];
            return (
              <article key={l.id} className="flex flex-col gap-4 rounded-[26px] bg-white p-6">
                <div className="flex items-center justify-between gap-2.5">
                  <Link href={`/market/${l.creator}`} className="flex min-w-0 items-center gap-3 text-ink no-underline">
                    <CreatorFace seed={l.creator} photo={faces[l.creator.toLowerCase()]?.photo} />
                    <span className="flex min-w-0 flex-col">
                      <span className="tnum truncate text-[17px] font-semibold">
                        {l.creator.slice(0, 6)}…{l.creator.slice(-4)}
                      </span>
                      <span className="text-[14px] text-grey">Licence {pad(l.id)}</span>
                    </span>
                  </Link>
                  <StatusPill kind={isActive ? "licensed" : l.status === "Revoked" ? "revoked" : "neutral"}>{STATUS_LABEL[l.status]}</StatusPill>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-field px-3 py-1.5 text-[13px]">{categoryLabels(l.category).join()}</span>
                  <span className="rounded-full border border-field px-3 py-1.5 text-[13px]">{isActive ? `Until ${fmtDay(BigInt(l.end))}` : `Ended ${fmtDay(BigInt(l.end))}`}</span>
                  {brief?.campaign && <span className="rounded-full border border-field px-3 py-1.5 text-[13px]">“{brief.campaign}”</span>}
                </div>
                <div className="flex items-baseline justify-between border-t border-divider pt-3.5">
                  <span className="text-[15px] text-grey">
                    {l.renderCount} of {l.renderCap} renders · {money(BigInt(l.pricePerRender))} each
                  </span>
                  <span className="tnum text-[17px] font-bold" title="Escrow balance">
                    {money(bal)}
                  </span>
                </div>
                {isActive ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] text-grey">
                      Deposit (USDC)
                      <input className={inputClass} inputMode="decimal" value={amounts[l.id] ?? suggested(l)} onChange={(e) => setAmounts({ ...amounts, [l.id]: e.target.value })} />
                    </label>
                    <button type="button" disabled={busy} onClick={() => deposit(l)} className={pillClass("outline", "min-h-11")}>
                      Deposit
                    </button>
                    <Link href={`/generate?licence=${l.id}`} className={pillClass("lime")}>
                      Generate
                    </Link>
                  </div>
                ) : bal > 0n ? (
                  <button type="button" disabled={busy} onClick={() => refund(l)} className={pillClass("ink")}>
                    Refund {money(bal)}
                  </button>
                ) : (
                  <span className="text-[14px] text-grey">Closed{BigInt(l.escrow.refunded) > 0n ? ` · refunded ${money(BigInt(l.escrow.refunded))}` : ""}</span>
                )}
              </article>
            );
          })}
        </div>
        {msg && (
          <div role="status" className="rounded-2xl bg-white px-5 py-3 text-[15px]">
            {msg}
          </div>
        )}
        <Delegation />
        <Renders />
      </Panel>
    </>
  );
}

function suggested(l: Row): string {
  return usdc.format(BigInt(l.pricePerRender) * BigInt(Math.max(0, l.renderCap - l.renderCount)));
}
