import type { Metadata } from "next";
import { AppPage, StatCard, StatusPill } from "@/components/ds";
import { Note } from "@/components/ui";
import { isLocalFork } from "@/lib/server/chain";
import { historySource } from "@/lib/server/index";
import { integrations } from "@/lib/server/integrations";
import { rendererPlan } from "@/lib/server/render";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status" };

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
    </AppPage>
  );
}
