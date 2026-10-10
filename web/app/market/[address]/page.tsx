import { isAddress, type Address } from "viem";
import { RequestLicence } from "@/components/market/RequestLicence";
import { Addr, Card, fmtDate, H2, Note, TrustBadge } from "@/components/ui";
import { categoryLabels, regionLabels } from "@/lib/categories";
import { formatDuration, usdc } from "@/lib/licensing";
import { readCreatorWithHistory } from "@/lib/server/protocol";
import { LEVEL_SUMMARY, LIVENESS_NOTE } from "@/lib/verification";

export const dynamic = "force-dynamic";

export default async function CreatorPage({ params }: PageProps<"/market/[address]">) {
  const { address } = await params;
  if (!isAddress(address)) return <Note tone="down">Not an address.</Note>;
  const c = await readCreatorWithHistory(address as Address);
  if (!c) return <Note tone="down">Not a registered creator.</Note>;
  const terms = { ...c.terms, maxDuration: c.terms.maxDuration.toString(), pricePerRender: c.terms.pricePerRender.toString() };
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <h1 className="tnum font-mono text-2xl">{c.address}</h1>
        <TrustBadge trust={c.trust} />
      </div>
      <Card className="space-y-4">
        <H2>Attestation and terms</H2>
        <dl className="grid grid-cols-[11rem_1fr] gap-y-2">
          <dt className="text-dim">Liveness provider</dt>
          <dd>
            <span className="font-mono">{c.trust.liveness}</span>
            {c.trust.level === "verified" && <span className="ml-2 text-xs text-muted">{LIVENESS_NOTE[c.trust.livenessMethod]}</span>}
          </dd>
          <dt className="text-dim">Age check provider</dt>
          <dd className="font-mono">{c.trust.age}</dd>
          {c.trust.level === "verified" && (
            <>
              <dt className="text-dim">Verification level</dt>
              <dd>
                {c.trust.livenessMethod === "passive" ? "free" : "full"}: {c.trust.livenessMethod === "passive" ? LEVEL_SUMMARY.free : LEVEL_SUMMARY.full}
              </dd>
            </>
          )}
          <dt className="text-dim">Verified</dt>
          <dd>
            {fmtDate(c.verifiedAt)}
            {c.upgradedAt ? <span className="ml-2 text-xs text-up">upgraded to this level on {fmtDate(c.upgradedAt)}</span> : null}
          </dd>
          <dt className="text-dim">Reference set hash</dt>
          <dd className="break-all font-mono text-xs">{c.referenceSetHash}</dd>
          <dt className="text-dim">Payout</dt>
          <dd>
            <Addr a={c.payout} />
          </dd>
          <dt className="text-dim">Allowed uses</dt>
          <dd>{categoryLabels(c.terms.categories).join(", ")}</dd>
          <dt className="text-dim">Regions</dt>
          <dd>{regionLabels(c.terms.regions).join(", ")}</dd>
          <dt className="text-dim">Price</dt>
          <dd className="tnum">{usdc.format(c.terms.pricePerRender)} USDC per render</dd>
          <dt className="text-dim">Limits per licence</dt>
          <dd>
            {c.terms.maxRenders} renders, {formatDuration(c.terms.maxDuration)}
          </dd>
          <dt className="text-dim">Approval</dt>
          <dd>{c.terms.autoApprove ? "Automatic for requests inside these terms" : "The creator signs every licence"}</dd>
        </dl>
        {c.trust.level === "unverified-test" && (
          <Note>This is a seeded test creator. No liveness or ID check was run; its images are synthetic placeholders.</Note>
        )}
      </Card>
      {c.canLicense ? <RequestLicence creator={c.address} terms={terms} /> : <Note>This creator is not accepting new licences.</Note>}
    </div>
  );
}
