"use client";

/** Creator dashboard (Dashboard.dc.html), on live data: every figure comes from the chain or the app's own records. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { CreatorRegistryAbi } from "@/lib/abi/CreatorRegistry";
import { LicenseRegistryAbi } from "@/lib/abi/LicenseRegistry";
import { api, reason, write } from "@/lib/client/tx";
import { categoryLabels, regionLabels } from "@/lib/categories";
import { deployment } from "@/lib/deployment";
import { approvalTypedData, declineMessage, formatDuration, usdc, type Licence, type Terms, type Trust } from "@/lib/licensing";
import { toRequest } from "@/components/market/RequestLicence";
import { TermsEditor } from "@/components/TermsEditor";
import { BrandChip, CardRings, HeroHeadline, HeroLine, Initial, InlinePill, LimeCard, Panel, pillClass, SectionTitle, StatCard, StatusPill } from "@/components/ds";
import { useBrandCards } from "@/lib/client/profiles";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { IconArrowRight, IconShield } from "@/components/ds/icons";
import { fmtDay, Note, STATUS_LABEL, Tx } from "@/components/ui";
import type { ActiveWallet } from "@/components/wallet/WalletProvider";
import { KeyRelease } from "./KeyRelease";
import { ReverifyFlow, useServerLevel } from "./Reverify";

type Json<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] };
export type CreatorJson = {
  address: Address;
  trust: Trust;
  terms: Json<Terms>;
  active: boolean;
  suspended: boolean;
  referenceSetHash: Hex;
  verifiedAt: number;
  upgradedAt?: number;
  payout: Address;
};
type Row = Json<Licence> & { escrow: { deposited: string; paidToCreator: string; refunded: string; balance: string }; release: { keyHeld: boolean; released: boolean } };
type Brief = { brand: string; campaign: string; use: string };
type PaidRender = { licenceId: string; renderIndex: number; assetHash: Hex; creatorAmount: string; timestamp: number; tx: Hex };
type Detail = { brief: Brief | null; renders: PaidRender[] };
type Req = { id: string; createdAt: number; licensee: Address; state: string; request: Record<string, string | number>; brief: Brief };

const WEEK = 7 * 86_400;
const money = (units: bigint) => `$${usdc.format(units)}`;
const pad = (id: string) => `#${id.padStart(4, "0")}`;

export function CreatorView({ wallet, creator, onChanged }: { wallet: ActiveWallet; creator: CreatorJson; onChanged: () => void }) {
  const [licences, setLicences] = useState<Row[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [requests, setRequests] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const [editing, setEditing] = useState(false);
  const [reverify, setReverify] = useState(false);
  const { level, canUpgrade } = useServerLevel(creator.trust);

  const load = useCallback(async () => {
    const [l, r] = await Promise.all([
      api<{ licences: Row[] }>(`/api/licences?creator=${wallet.address}`),
      api<{ requests: Req[] }>(`/api/requests?creator=${wallet.address}`),
    ]);
    setLicences(l.licences);
    setRequests(r.requests.filter((x) => x.state === "pending").sort((a, b) => a.createdAt - b.createdAt));
    const d = await Promise.all(l.licences.map((x) => api<Detail>(`/api/licences/${x.id}`).then((j) => [x.id, { brief: j.brief, renders: j.renders }] as const)));
    setDetails(Object.fromEntries(d));
  }, [wallet.address]);
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
      onChanged();
    } catch (e) {
      setMsg(<span className="text-bad">{reason(e)}</span>);
    } finally {
      setBusy(false);
    }
  }

  const terms: Terms = { ...creator.terms, maxDuration: BigInt(creator.terms.maxDuration), pricePerRender: BigInt(creator.terms.pricePerRender) };
  const allRenders = useMemo(() => Object.values(details).flatMap((d) => d.renders).sort((a, b) => b.timestamp - a.timestamp), [details]);
  const earned = licences.reduce((s, l) => s + BigInt(l.escrow.paidToCreator), 0n);
  const now = Math.floor(Date.now() / 1000);
  const earnedWeek = allRenders.filter((r) => r.timestamp >= now - WEEK).reduce((s, r) => s + BigInt(r.creatorAmount), 0n);
  const active = licences.filter((l) => l.status === "Active");
  const verified = creator.trust.level === "verified";
  const passive = creator.trust.level === "verified" && creator.trust.livenessMethod === "passive";
  const oldest = requests[0];
  // A licensee's brand profile (name, logo, badge) wins over the free-text brand in the brief.
  const cards = useBrandCards([...requests.map((r) => r.licensee), ...licences.map((l) => l.licensee)]);
  const brandOf = (id: string, licensee: string) => cards[licensee.toLowerCase()]?.name || details[id]?.brief?.brand || `Brand ${licensee.slice(0, 6)}…`;

  async function approve(r: Req) {
    const req = toRequest(r.request);
    await run("Sign the approval in your wallet…", async () => {
      const signature = await wallet.client.signTypedData({ account: wallet.client.account, ...approvalTypedData(deployment.chainId, deployment.LicenseRegistry!, req, r.licensee) });
      await api(`/api/requests/${r.id}`, { method: "POST", body: JSON.stringify({ approve: true, signature }) });
    });
  }
  async function decline(r: Req) {
    await run("Declining…", async () => {
      const signature = await wallet.client.signMessage({ account: wallet.client.account, message: declineMessage(r.id) });
      await api(`/api/requests/${r.id}`, { method: "POST", body: JSON.stringify({ approve: false, signature }) });
    });
  }

  return (
    <>
      <section className="on-dark mx-auto flex max-w-[1320px] flex-wrap items-stretch gap-10 px-4 pb-[84px] pt-7 text-white sm:px-8 sm:pt-9">
        <HeroHeadline label={`Your face earned ${money(earnedWeek)} this week`}>
          <HeroLine>
            Your face
            <InlinePill icon={<IconShield size={18} stroke="#DCF37B" />}>{verified ? "Verified" : "Not verified"}</InlinePill>
          </HeroLine>
          <HeroLine>earned {money(earnedWeek)}</HeroLine>
          <HeroLine muted>this week</HeroLine>
        </HeroHeadline>

        {oldest ? (
          <LimeCard label="Request waiting for you">
            <span className="self-start rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-lime">
              Waiting for you{requests.length > 1 ? ` · ${requests.length} requests` : ""}
            </span>
            <h2 className="m-0 text-[clamp(22px,2.4vw,28px)] font-bold leading-[1.1] tracking-[-0.02em]">{cards[oldest.licensee.toLowerCase()]?.name ?? oldest.brief.brand} wants to license you</h2>
            <span className="rounded-[14px] bg-white/70 px-3 py-2 text-[14px]">
              <BrandChip brand={cards[oldest.licensee.toLowerCase()]} fallback={oldest.brief.brand} />
            </span>
            <p className="m-0 text-[15px] leading-relaxed">
              {categoryLabels(Number(oldest.request.category)).join()} · {oldest.request.renderCap} renders · {formatDuration(BigInt(oldest.request.duration))} · {money(BigInt(oldest.request.pricePerRender))} per render
              <br />“{oldest.brief.campaign}”
            </p>
            <div className="mt-auto flex flex-wrap gap-2.5">
              <button type="button" disabled={busy} onClick={() => approve(oldest)} className="min-h-12 flex-1 rounded-[18px] bg-ink px-5 text-[15px] font-semibold text-white disabled:opacity-50">
                Approve
              </button>
              <button type="button" disabled={busy} onClick={() => decline(oldest)} className="min-h-12 rounded-[18px] border-2 border-ink bg-transparent px-5 text-[15px] font-semibold text-ink disabled:opacity-50">
                Decline
              </button>
            </div>
          </LimeCard>
        ) : (
          <LimeCard label="Share your profile">
            <span className="self-start rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-lime">No requests waiting</span>
            <h2 className="m-0 text-[clamp(22px,2.4vw,28px)] font-bold leading-[1.1] tracking-[-0.02em]">Share your profile</h2>
            <p className="m-0 text-[15px] leading-relaxed">Brands find you in the marketplace. Send them your page so they can request a licence directly.</p>
            <div className="mt-auto flex flex-wrap gap-2.5">
              <Link href={`/market/${creator.address}`} className="flex min-h-12 flex-1 items-center justify-center rounded-[18px] bg-ink px-5 text-[15px] font-semibold text-white no-underline">
                Open my profile
              </Link>
              <CopyLink path={`/market/${creator.address}`} />
            </div>
          </LimeCard>
        )}
      </section>

      <Panel>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Earned, after fee" value={money(earned)} note="USDC paid to your wallet" />
          <StatCard label="Renders paid" value={allRenders.length} note="each with a receipt" />
          <StatCard label="Active licences" value={active.length} note={`${requests.length} request${requests.length === 1 ? "" : "s"} waiting`} />
          <button
            type="button"
            onClick={() => canUpgrade && setReverify(true)}
            aria-disabled={!canUpgrade}
            className={`relative flex flex-col gap-1.5 overflow-hidden rounded-[26px] bg-violet-deep p-6 text-left text-white ${canUpgrade ? "cursor-pointer" : "cursor-default"}`}
          >
            <CardRings stroke="#FFFFFF" opacity={0.35} />
            <span className="relative text-[15px] text-violet-soft">Verification</span>
            <span className="relative text-[20px] font-bold leading-[1.1]">{!verified ? "Not verified" : passive ? "Passive liveness" : "Active liveness"}</span>
            <span className="relative inline-flex items-center gap-1.5 text-[14px] font-semibold">
              {canUpgrade ? (
                <>
                  Re-verify at {level} level <IconArrowRight size={16} stroke="#FFFFFF" />
                </>
              ) : (
                `Verified ${fmtDay(creator.verifiedAt)}${creator.upgradedAt ? ` · upgraded ${fmtDay(creator.upgradedAt)}` : ""}`
              )}
            </span>
          </button>
        </div>

        {reverify && (
          <div className="rounded-[26px] bg-white p-6">
            <ReverifyFlow
              referenceSetHash={creator.referenceSetHash}
              onDone={() => {
                setReverify(false);
                onChanged();
              }}
            />
          </div>
        )}

        <ProfileCard wallet={wallet} referenceSetHash={creator.referenceSetHash as Hex} />

        <SectionTitle
          action={
            <button
              type="button"
              disabled={busy || active.length === 0}
              onClick={() => {
                if (confirm("Revoke every licence you have issued? New renders stop at once and brands can take back unused escrow."))
                  void run("Revoking all…", () => write(wallet, { address: deployment.CreatorRegistry!, abi: CreatorRegistryAbi, functionName: "revokeAll", args: [] }));
              }}
              className={pillClass("danger")}
            >
              Revoke all
            </button>
          }
        >
          Licences
        </SectionTitle>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {licences.length === 0 && (
            <div className="flex flex-col gap-2 rounded-[26px] border-2 border-dashed border-field bg-white/60 p-6">
              <h3 className="m-0 text-lg font-semibold">No licences yet</h3>
              <p className="m-0 text-[15px] text-grey">When a brand requests one, it appears at the top of this page for you to approve.</p>
            </div>
          )}
          {licences.map((l) => {
            const brand = brandOf(l.id, l.licensee);
            const isActive = l.status === "Active";
            const refunded = BigInt(l.escrow.refunded);
            return (
              <article key={l.id} className="flex flex-col gap-4 rounded-[26px] bg-white p-6">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    {cards[l.licensee.toLowerCase()]?.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cards[l.licensee.toLowerCase()]!.logo!} alt="" width={52} height={52} className="h-[52px] w-[52px] shrink-0 rounded-full border border-field bg-white object-contain" />
                    ) : (
                      <Initial name={brand} dark={isActive} />
                    )}
                    <div className="flex min-w-0 flex-col">
                      <h3 className={`m-0 truncate text-[17px] font-semibold ${isActive ? "" : "text-grey"}`}>{brand}</h3>
                      <span className="text-[14px] text-grey">Licence {pad(l.id)}</span>
                      <BadgeLine badge={cards[l.licensee.toLowerCase()]?.badge} />
                    </div>
                  </div>
                  <StatusPill kind={isActive ? "licensed" : l.status === "Revoked" ? "revoked" : "neutral"}>{STATUS_LABEL[l.status]}</StatusPill>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-field px-3 py-1.5 text-[13px]">{categoryLabels(l.category).join()}</span>
                  <span className="rounded-full border border-field px-3 py-1.5 text-[13px]">
                    {refunded > 0n ? `Refunded ${money(refunded)}` : isActive ? `Until ${fmtDay(BigInt(l.end))}` : `Ended ${fmtDay(BigInt(l.end))}`}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-divider pt-3.5">
                  <span className="text-[15px] text-grey">
                    {l.renderCount} of {l.renderCap} renders
                  </span>
                  <span className={`tnum text-[18px] font-bold ${isActive ? "" : "text-grey"}`}>{money(BigInt(l.escrow.paidToCreator))}</span>
                </div>
                {isActive && !l.release.released && (
                  <div className="rounded-2xl bg-wait-bg p-3 text-[14px] text-wait">
                    <p className="m-0 mb-2">Renders wait until you release your photos to this licence.</p>
                    <KeyRelease licenceId={BigInt(l.id)} referenceSetHash={creator.referenceSetHash} released={l.release.released} onDone={load} />
                  </div>
                )}
                <div className="flex gap-2">
                  <a href="#renders" className="flex min-h-11 flex-1 items-center justify-center rounded-2xl border border-field font-semibold text-ink no-underline">
                    {isActive ? "See renders" : "See history"}
                  </a>
                  {isActive && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(`Revoking licence ${pad(l.id)}…`, () => write(wallet, { address: deployment.LicenseRegistry!, abi: LicenseRegistryAbi, functionName: "revoke", args: [BigInt(l.id)] }))}
                      className="min-h-11 flex-1 rounded-2xl bg-red font-semibold text-ink disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          <article id="terms" className="on-dark flex scroll-mt-6 flex-col gap-3.5 rounded-[26px] bg-ink p-6 text-white">
            <div className="flex items-center justify-between gap-2.5">
              <h3 className="m-0 text-[19px] font-semibold">Your terms</h3>
              <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing} className="min-h-11 rounded-full bg-lime px-[18px] font-semibold text-ink">
                {editing ? "Close" : "Edit"}
              </button>
            </div>
            <dl className="m-0 flex flex-col gap-2.5 text-[15px]">
              {[
                ["Uses", categoryLabels(terms.categories).join(", ")],
                ["Regions", regionLabels(terms.regions).join(", ")],
                ["Price", `${money(terms.pricePerRender)} per render`],
                ["Limits", `${terms.maxRenders} renders, ${formatDuration(terms.maxDuration)}`],
                ["Approval", terms.autoApprove ? "Automatic inside these terms" : "Ask me each time"],
                ["Never", "Political, adult, minors, impersonation, deception"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-grey-dark">{k}</dt>
                  <dd className="m-0 text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              disabled={busy || creator.suspended}
              onClick={() => run("Updating…", () => write(wallet, { address: deployment.CreatorRegistry!, abi: CreatorRegistryAbi, functionName: "setActive", args: [!creator.active] }))}
              className="mt-auto min-h-12 rounded-2xl border border-ink-line-2 bg-transparent font-semibold text-white disabled:opacity-50"
            >
              {creator.suspended ? "Suspended by the platform" : creator.active ? "Pause new licences" : "Accept new licences"}
            </button>
          </article>
        </div>

        {editing && (
          <div className="rounded-[26px] bg-white p-6">
            <TermsEditor
              initial={terms}
              busy={busy}
              submitLabel="Save terms on chain"
              onSubmit={(t) => run("Saving terms…", () => write(wallet, { address: deployment.CreatorRegistry!, abi: CreatorRegistryAbi, functionName: "setTerms", args: [t] })).then(() => setEditing(false))}
            />
          </div>
        )}

        {msg && (
          <div role="status" className="rounded-2xl bg-white px-5 py-3 text-[15px]">
            {msg}
          </div>
        )}

        <section id="renders" aria-label="Recent renders" className="flex scroll-mt-4 flex-col gap-4 pt-2">
          <SectionTitle>Recent renders</SectionTitle>
          {allRenders.length === 0 ? (
            <Note tone="dim">No paid renders yet.</Note>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {allRenders.slice(0, 8).map((r) => {
                const l = licences.find((x) => x.id === r.licenceId);
                return (
                  <figure key={r.assetHash} className="m-0 flex flex-col gap-3 rounded-[26px] bg-white p-3.5">
                    <Link
                      href={`/verify?hash=${r.assetHash}`}
                      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[18px] bg-[#E3E6EC] p-4 text-center text-[14px] text-grey no-underline"
                    >
                      <span className="font-semibold text-ink">Render {r.renderIndex}</span>
                      <span className="tnum break-all font-mono text-[12px]">
                        {r.assetHash.slice(0, 10)}…{r.assetHash.slice(-6)}
                      </span>
                      <span className="underline">Check this file</span>
                    </Link>
                    <figcaption className="flex items-center justify-between gap-2 text-[14px]">
                      <span className="truncate">
                        {l ? brandOf(l.id, l.licensee) : "Brand"} · {pad(r.licenceId)}
                      </span>
                      <StatusPill kind="licensed">+{money(BigInt(r.creatorAmount))}</StatusPill>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
          <p className="m-0 text-[13px] text-grey">The image files go to the brand that paid for them; each one can be checked here by its receipt.</p>
        </section>
      </Panel>
    </>
  );
}

function CopyLink({ path }: { path: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {}
      }}
      className="min-h-12 rounded-[18px] border-2 border-ink bg-transparent px-5 text-[15px] font-semibold text-ink"
    >
      <span aria-live="polite">{done ? "Copied" : "Copy link"}</span>
    </button>
  );
}

function BadgeLine({ badge }: { badge?: "verified-domain" | "unverified" }) {
  if (!badge) return <span className="text-[13px] text-grey">No brand profile</span>;
  return <span className={`text-[13px] font-semibold ${badge === "verified-domain" ? "text-ok" : "text-wait"}`}>{badge === "verified-domain" ? "Verified domain" : "Unverified brand"}</span>;
}
