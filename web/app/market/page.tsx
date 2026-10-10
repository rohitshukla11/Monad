import Link from "next/link";
import { Card, Note, TrustBadge } from "@/components/ui";
import { categoryLabels, regionLabels } from "@/lib/categories";
import { formatDuration, usdc } from "@/lib/licensing";
import { historySource } from "@/lib/server/index";
import { listCreators, type CreatorView } from "@/lib/server/protocol";

export const dynamic = "force-dynamic";

export default async function Market() {
  let creators: CreatorView[] = [];
  let error: string | null = null;
  try {
    // Only creators Didit has verified are offered for licensing.
    creators = (await listCreators()).filter((c) => c.trust.level === "verified" && !c.suspended);
  } catch (e) {
    error = (e as Error).message;
  }
  const source = historySource();
  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-semibold">Marketplace</h1>
        <span className="text-xs text-dim">
          Registered creators on Monad testnet · listed from {source === "envio" ? "the Envio indexer" : "RPC log scan (no indexer configured)"}
        </span>
      </div>
      {error && <Note tone="down">Could not read the registry: {error}</Note>}
      {!error && creators.length === 0 && <Note tone="dim">No verified creators yet.</Note>}
      <div className="grid grid-cols-2 gap-6">
        {creators.map((c) => (
          <Link key={c.address} href={`/market/${c.address}`} className="block">
            <Card className="h-full space-y-4 hover:border-muted">
              <div className="flex items-center justify-between">
                <span className="tnum font-mono">{c.address.slice(0, 10)}…{c.address.slice(-6)}</span>
                <TrustBadge trust={c.trust} />
              </div>
              <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5">
                <dt className="text-dim">Uses</dt>
                <dd>{categoryLabels(c.terms.categories).join(", ")}</dd>
                <dt className="text-dim">Regions</dt>
                <dd>{regionLabels(c.terms.regions).join(", ")}</dd>
                <dt className="text-dim">Price</dt>
                <dd className="tnum">{usdc.format(c.terms.pricePerRender)} USDC per render</dd>
                <dt className="text-dim">Limits</dt>
                <dd>
                  up to {c.terms.maxRenders} renders, {formatDuration(c.terms.maxDuration)}
                </dd>
                <dt className="text-dim">Approval</dt>
                <dd>{c.terms.autoApprove ? "Automatic inside these terms" : "Creator signs each licence"}</dd>
              </dl>
              {!c.canLicense && <Note>{c.suspended ? "Suspended by the platform." : "Not accepting new licences."}</Note>}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
