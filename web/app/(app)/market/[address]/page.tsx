import type { Metadata } from "next";
import Link from "next/link";
import { isAddress, type Address } from "viem";
import { RequestLicence } from "@/components/market/RequestLicence";
import { Avatar, EmptyState, LimeCard, NoticePage, PageHero, Panel, StatCard, TagChip, Tile, pillClass } from "@/components/ds";
import { IconArrowLeft, VerifiedMark } from "@/components/ds/icons";
import { Addr, Note, Tx, TrustBadge, fmtDay, shortAddr } from "@/components/ui";
import { categoryLabels, regionLabels } from "@/lib/categories";
import { explorer } from "@/lib/chain";
import { formatDuration, usdc } from "@/lib/licensing";
import { readCreatorWithHistory } from "@/lib/server/protocol";
import { LEVEL_SUMMARY, LIVENESS_NOTE } from "@/lib/verification";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/market/[address]">): Promise<Metadata> {
  const { address } = await params;
  return { title: isAddress(address) ? `Creator ${shortAddr(address)}` : "Creator" };
}

export default async function CreatorPage({ params }: PageProps<"/market/[address]">) {
  const { address } = await params;
  if (!isAddress(address)) return <NoticePage title="Not an address">That link does not point to a wallet address.</NoticePage>;
  const c = await readCreatorWithHistory(address as Address);
  if (!c) return <NoticePage title="Not a registered creator">No creator is registered at {shortAddr(address)}.</NoticePage>;
  const terms = { ...c.terms, maxDuration: c.terms.maxDuration.toString(), pricePerRender: c.terms.pricePerRender.toString() };
  const verified = c.trust.level === "verified";
  const method = c.trust.level === "verified" ? c.trust.livenessMethod : null;

  return (
    <>
      <PageHero>
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
          <Link href="/market" className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] text-grey-dark hover:text-white">
            <IconArrowLeft size={18} /> All creators
          </Link>
          <div className="flex flex-wrap items-center gap-5">
            <Avatar seed={c.address} size={96} ring="#121316" />
            <h1 className="m-0 flex min-w-0 flex-wrap items-center gap-3 font-mono text-[clamp(30px,5vw,56px)] font-bold tracking-[-0.03em]">
              <span className="sr-only">Creator </span>
              {shortAddr(c.address)}
              {verified && <VerifiedMark size={36} />}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TrustBadge trust={c.trust} />
            {categoryLabels(c.terms.categories).map((l) => (
              <span key={l} className="inline-flex items-center rounded-full border border-ink-line-2 px-3 py-1.5 text-[13px] font-medium text-white">
                {l}
              </span>
            ))}
          </div>
        </div>
        <LimeCard label="Licence price">
          <span className="text-[15px] font-semibold">Price per render</span>
          <span className="tnum text-[clamp(44px,5vw,64px)] font-bold leading-none tracking-[-0.03em]">${usdc.format(c.terms.pricePerRender)}</span>
          <span className="text-[15px]">
            USDC, paid from escrow per render. Up to {c.terms.maxRenders} renders over {formatDuration(c.terms.maxDuration)}.
          </span>
          <span className="text-[15px] font-semibold">{c.terms.autoApprove ? "Instant inside these terms" : "The creator approves every licence"}</span>
          <div className="mt-auto pt-2">
            {c.canLicense ? (
              <a href="#request" className={pillClass("ink")}>
                Request licence
              </a>
            ) : (
              <span className="text-[15px] font-semibold">Not accepting new licences</span>
            )}
          </div>
        </LimeCard>
      </PageHero>

      <Panel>
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-3">
          <StatCard label="Verified" value={fmtDay(c.verifiedAt)} note={c.upgradedAt ? `Upgraded ${fmtDay(c.upgradedAt)}` : method ? `${method === "passive" ? "Free" : "Full"} level` : undefined} />
          <StatCard label="Regions" value={regionLabels(c.terms.regions).length} note={regionLabels(c.terms.regions).join(", ")} />
          <StatCard label="Licence length" value={formatDuration(c.terms.maxDuration)} note="Maximum per licence" />
        </div>

        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
          <Tile as="section">
            <h2 className="m-0 text-[22px] font-semibold">Verification</h2>
            <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 text-[15px] sm:grid-cols-[11rem_1fr]">
              <dt className="text-grey">Liveness provider</dt>
              <dd className="m-0">
                <span className="font-mono">{c.trust.liveness}</span>
                {method && <span className="block text-[13px] text-grey">{LIVENESS_NOTE[method]}</span>}
              </dd>
              <dt className="text-grey">Age check provider</dt>
              <dd className="m-0 font-mono">{c.trust.age}</dd>
              {method && (
                <>
                  <dt className="text-grey">Verification level</dt>
                  <dd className="m-0">
                    {method === "passive" ? "free" : "full"}: {method === "passive" ? LEVEL_SUMMARY.free : LEVEL_SUMMARY.full}
                  </dd>
                </>
              )}
              <dt className="text-grey">Reference set hash</dt>
              <dd className="m-0 break-all font-mono text-[13px]">{c.referenceSetHash}</dd>
              {c.registeredTx && (
                <>
                  <dt className="text-grey">Registered</dt>
                  <dd className="m-0">
                    <Tx hash={c.registeredTx} />
                  </dd>
                </>
              )}
              {c.upgradedTx && (
                <>
                  <dt className="text-grey">Upgraded</dt>
                  <dd className="m-0">
                    <Tx hash={c.upgradedTx} />
                  </dd>
                </>
              )}
            </dl>
            {c.trust.level === "unverified-test" && <Note>This is a seeded test creator. No liveness or ID check was run; its images are synthetic placeholders.</Note>}
          </Tile>
          <Tile as="section">
            <h2 className="m-0 text-[22px] font-semibold">Terms</h2>
            <div className="flex flex-wrap gap-2">
              {categoryLabels(c.terms.categories).map((l) => (
                <TagChip key={l}>{l}</TagChip>
              ))}
            </div>
            <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 text-[15px] sm:grid-cols-[11rem_1fr]">
              <dt className="text-grey">Regions</dt>
              <dd className="m-0">{regionLabels(c.terms.regions).join(", ")}</dd>
              <dt className="text-grey">Price</dt>
              <dd className="tnum m-0">{usdc.format(c.terms.pricePerRender)} USDC per render</dd>
              <dt className="text-grey">Limits per licence</dt>
              <dd className="m-0">
                {c.terms.maxRenders} renders, {formatDuration(c.terms.maxDuration)}
              </dd>
              <dt className="text-grey">Approval</dt>
              <dd className="m-0">{c.terms.autoApprove ? "Automatic for requests inside these terms" : "The creator signs every licence"}</dd>
              <dt className="text-grey">Payout</dt>
              <dd className="m-0">
                <Addr a={c.payout} />
              </dd>
              <dt className="text-grey">On MonadVision</dt>
              <dd className="m-0">
                <a href={explorer.address(c.address)} target="_blank" rel="noreferrer" className="font-semibold text-wait underline">
                  Creator wallet<span className="sr-only"> (opens MonadVision)</span>
                </a>
              </dd>
            </dl>
          </Tile>
        </div>

        {c.canLicense ? (
          <RequestLicence creator={c.address} terms={terms} />
        ) : (
          <EmptyState title="Not accepting new licences">This creator is not accepting new licences right now. Existing licences keep their terms until they end.</EmptyState>
        )}
      </Panel>
    </>
  );
}
