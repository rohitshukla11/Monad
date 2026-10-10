import { KeysPanel } from "@/components/KeysPanel";
import { CreatorFlow } from "@/components/onboard/CreatorFlow";
import { Note } from "@/components/ui";
import { WalletPanel } from "@/components/WalletPanel";
import { isConfigured } from "@/lib/server/integrations";

export const dynamic = "force-dynamic";

export default function Onboard() {
  const didit = isConfigured("didit");
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-semibold">Become a creator</h1>
      {!didit && (
        <div className="space-y-1 rounded-card border border-warn/40 p-6">
          <Note>Liveness not configured and ID check not performed: Didit is not set up (DIDIT_API_KEY, DIDIT_WORKFLOW_ID).</Note>
          <Note tone="dim">No creator can be attested as verified on this server until it is.</Note>
        </div>
      )}
      <WalletPanel />
      <KeysPanel />
      <CreatorFlow />
    </div>
  );
}
