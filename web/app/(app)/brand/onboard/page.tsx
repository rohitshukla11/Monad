import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandOnboard } from "@/components/brand/BrandOnboard";
import { HeroHeadline, HeroLine, InlinePill, Panel } from "@/components/ds";
import { IconCheck } from "@/components/ds/icons";

export const metadata: Metadata = { title: "License a face" };

export default function BrandOnboardPage() {
  return (
    <>
      <section className="on-dark mx-auto flex max-w-[1320px] flex-wrap items-end gap-10 px-4 pb-[84px] pt-7 text-white sm:px-8 sm:pt-9">
        <HeroHeadline label="License a face, with consent">
          <HeroLine>
            License a face
            <InlinePill icon={<IconCheck size={18} stroke="#DCF37B" />}>Brands</InlinePill>
          </HeroLine>
          <HeroLine muted>with consent</HeroLine>
        </HeroHeadline>
      </section>
      <Panel>
        <Suspense>
          <BrandOnboard />
        </Suspense>
      </Panel>
    </>
  );
}
