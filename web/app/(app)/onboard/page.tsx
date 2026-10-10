import type { Metadata } from "next";
import { HeroHeadline, HeroLine, InlinePill, Panel } from "@/components/ds";
import { IconShield } from "@/components/ds/icons";
import { OnboardFlow } from "@/components/onboard/OnboardFlow";
import { Note } from "@/components/ui";
import { isConfigured } from "@/lib/server/integrations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Become a creator" };

export default function Onboard() {
  const didit = isConfigured("didit");
  return (
    <>
      <section className="on-dark mx-auto flex max-w-[1320px] flex-wrap items-end gap-10 px-4 pb-[110px] pt-8 text-white sm:px-8 sm:pt-11">
        <HeroHeadline label="License your face in three steps">
          <HeroLine>
            License your face
            <InlinePill icon={<IconShield size={26} stroke="#DCF37B" />}>18+ only</InlinePill>
          </HeroLine>
          <HeroLine muted>in three steps</HeroLine>
        </HeroHeadline>
      </section>
      <Panel>
        {!didit && <Note>Liveness not configured and ID check not performed: Didit is not set up on this server, so no creator can be verified here.</Note>}
        <OnboardFlow />
      </Panel>
    </>
  );
}
