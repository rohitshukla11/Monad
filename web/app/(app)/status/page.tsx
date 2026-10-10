import type { Metadata } from "next";
import { AppPage, SectionTitle, StatCard, StatusPill } from "@/components/ds";
import { Note } from "@/components/ui";
import { explorer } from "@/lib/chain";
import { deployment } from "@/lib/deployment";
import { isLocalFork } from "@/lib/server/chain";
import { historySource } from "@/lib/server/index";
import { integrations } from "@/lib/server/integrations";
import { rendererPlan } from "@/lib/server/render";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status" };

const CONTRACTS: { name: "CreatorRegistry" | "LicenseRegistry" | "LicenseEscrow" | "ReceiptAnchor"; does: string }[] = [
  { name: "CreatorRegistry", does: "Didit-backed attestation (ID 18+, liveness, face match), terms, payout and one-click revocation. Hashes only." },
  { name: "LicenseRegistry", does: "Non-transferable, expiring licences, issued against the creator's signature or inside their auto-approve terms." },
  { name: "LicenseEscrow", does: "USDC per licence. Each render pays the creator and anchors a receipt in one transaction; the rest is refundable." },
  { name: "ReceiptAnchor", does: "One receipt per delivered file, keyed by its sha256. Anyone can look a file up." },
];

/** What this server can and cannot do right now, and which credential turns each piece on. */
export default function Status() {
  const list = integrations();
  const plan = rendererPlan();
  const on = list.filter((i) => i.configured).length;
  return (
    <AppPage title="What this server runs" kicker="Status">
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Chain" value={isLocalFork() ? "Local fork" : "Monad testnet"} note={isLocalFork() ? "An anvil fork of Monad testnet" : "Chain ID 10143"} />
        <StatCard label="History" value={historySource() === "envio" ? "Envio" : "RPC scan"} note={historySource() === "envio" ? "Envio indexer" : "RPC log scan"} />
        <StatCard label="Renderer" value={plan.test ? "Test" : "Live"} note={plan.test ? "DevRenderer (TEST RENDER)" : plan.primary} />
        <StatCard label="Integrations" value={`${on} of ${list.length}`} note="configured" />
      </div>
      <Note tone="dim">Nothing is reported as verified, generated or signed by a provider that is not configured here.</Note>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {list.map((i) => (
          <li key={i.key} className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-[26px] bg-white p-6 text-[15px] md:grid-cols-[14rem_1fr]">
            <div className="flex flex-wrap items-center gap-3 md:flex-col md:items-start">
              <h2 className="m-0 text-[17px] font-semibold">{i.name}</h2>
              {i.configured ? <StatusPill kind="licensed">configured</StatusPill> : <StatusPill kind="waiting">not configured</StatusPill>}
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="m-0">
                <span className="text-grey">Turns on:</span> {i.turnsOn}
              </p>
              {!i.configured && (
                <p className="m-0 text-wait">
                  <span className="text-grey">Now:</span> {i.whenMissing}
                </p>
              )}
              <p className="m-0 break-all font-mono text-[13px] text-grey">{i.env.join(" · ")}</p>
            </div>
          </li>
        ))}
      </ul>
      <section id="contracts" aria-labelledby="contracts-title" className="flex scroll-mt-6 flex-col gap-4 pt-4">
        <SectionTitle id="contracts-title">For AI tools and verifiers</SectionTitle>
        <p className="m-0 max-w-3xl text-[15px] text-grey">
          Likeness is a protocol; this app is its reference client. Any image tool can check a licence, pay per render and anchor a receipt through the
          same four contracts on Monad, and anyone can check a file.
        </p>
        <ul className="m-0 grid list-none grid-cols-1 gap-[18px] p-0 sm:grid-cols-2">
          {CONTRACTS.flatMap((c) => {
            const a = deployment[c.name];
            if (!a) return [];
            return [
              <li key={c.name} className="flex flex-col gap-2 rounded-[26px] bg-white p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="m-0 text-[17px] font-semibold">{c.name}</h3>
                  <a href={explorer.address(a)} target="_blank" rel="noreferrer" className="tnum font-mono text-[13px] text-wait">
                    {a.slice(0, 8)}…{a.slice(-4)}
                    <span className="sr-only"> (opens MonadVision)</span>
                  </a>
                </div>
                <p className="m-0 text-[15px] text-grey">{c.does}</p>
              </li>,
            ];
          })}
        </ul>
      </section>
    </AppPage>
  );
}
