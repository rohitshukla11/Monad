import type { Metadata } from "next";
import { AppPage, ErrorCard } from "@/components/ds";
import { OnboardFlow } from "@/components/onboard/OnboardFlow";
import { isConfigured } from "@/lib/server/integrations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Become a creator" };

export default function Onboard() {
  const didit = isConfigured("didit");
  return (
    <AppPage narrow title="Become a creator" description="License your face in a few steps. 18+ only; you approve every licence.">
      {!didit && <ErrorCard>Liveness not configured and ID check not performed: Didit is not set up on this server, so no creator can be verified here.</ErrorCard>}
      <OnboardFlow />
    </AppPage>
  );
}
