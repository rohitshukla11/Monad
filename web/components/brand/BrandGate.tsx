"use client";

/**
 * Licence requests come from brands with a completed profile: creators see who is asking (name, logo,
 * badge) before they approve. A signed-in wallet without one is sent to brand onboarding, then back.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { pillClass } from "@/components/ds";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useBrandReady } from "./useBrandReady";

export function BrandGate({ creator, children }: { creator: string; children: ReactNode }) {
  const { wallet } = useWallet();
  const ready = useBrandReady();
  if (wallet && ready) return <>{children}</>;
  const next = encodeURIComponent(`/market/${creator}#request`);
  return (
    <section id="request" aria-labelledby="request-title" className="flex scroll-mt-6 flex-col items-start gap-3 rounded-[26px] bg-white p-6 sm:p-8">
      <h2 id="request-title" className="m-0 text-[clamp(20px,2vw,24px)] font-bold tracking-[-0.02em]">
        Request a licence
      </h2>
      <p className="m-0 max-w-2xl text-[15px] text-grey">
        Licences are requested by brands with a Likeness brand profile: your company name, logo and domain check, and the brand policy signed by your wallet. It takes about two minutes.
      </p>
      <Link href={`/brand/onboard?next=${next}`} className={pillClass("ink")}>
        {wallet ? "Finish your brand profile" : "Set up your brand"}
      </Link>
    </section>
  );
}
