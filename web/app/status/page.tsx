import { Badge, Card, Note } from "@/components/ui";
import { isLocalFork } from "@/lib/server/chain";
import { historySource } from "@/lib/server/index";
import { integrations } from "@/lib/server/integrations";
import { rendererPlan } from "@/lib/server/render";

export const dynamic = "force-dynamic";

/** What this server can and cannot do right now, and which credential turns each piece on. */
export default function Status() {
  const list = integrations();
  const plan = rendererPlan();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Status</h1>
      <Card className="space-y-2">
        <p>
          Chain: {isLocalFork() ? "a local fork of Monad testnet" : "Monad testnet (10143)"} · History: {historySource() === "envio" ? "Envio indexer" : "RPC log scan"} · Renderer:{" "}
          {plan.test ? "DevRenderer (TEST RENDER)" : plan.primary}
        </p>
        <Note tone="dim">Nothing is reported as verified, generated or signed by a provider that is not configured here.</Note>
      </Card>
      <div className="space-y-3">
        {list.map((i) => (
          <Card key={i.key} className="grid grid-cols-[14rem_1fr] gap-x-6 gap-y-1.5">
            <div className="space-y-2">
              <div className="font-semibold">{i.name}</div>
              {i.configured ? <Badge tone="up">configured</Badge> : <Badge tone="warn">not configured</Badge>}
            </div>
            <div className="space-y-1.5">
              <p>
                <span className="text-dim">Turns on:</span> {i.turnsOn}
              </p>
              {!i.configured && (
                <p className="text-warn">
                  <span className="text-dim">Now:</span> {i.whenMissing}
                </p>
              )}
              <p className="font-mono text-xs text-dim">{i.env.join(" · ")}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
