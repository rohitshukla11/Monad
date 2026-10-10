import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandOnboard } from "@/components/brand/BrandOnboard";
import { AppPage } from "@/components/ds";

export const metadata: Metadata = { title: "License a face" };

export default function BrandOnboardPage() {
  return (
    <AppPage narrow title="Set up your brand" description="License a face with consent: your company profile, a domain check and the brand policy.">
      <Suspense>
        <BrandOnboard />
      </Suspense>
    </AppPage>
  );
}
