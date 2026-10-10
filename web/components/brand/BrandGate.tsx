"use client";

/**
 * Licence requests come from brands with a completed profile: creators see who is asking (name, logo,
 * badge) before they approve. A signed-in wallet without one is sent to brand onboarding, then back.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { btnClass, Card } from "@/components/ds";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useBrandReady } from "./useBrandReady";

export function BrandGate({ creator, children }: { creator: string; children: ReactNode }) {
  const { wallet } = useWallet();
  const ready = useBrandReady();
  if (wallet && ready) return <>{children}</>;
  const next = encodeURIComponent(`/market/${creator}#request`);
  return (
    <Card id="request" title="Request a licence">
      <p className="m-0 text-[14px] text-grey">
        Licences are requested by brands with a Likeness brand profile: your company name, logo and domain check, and the brand policy signed by your wallet. It takes about two minutes.
      </p>
      <Link href={`/brand/onboard?next=${next}`} className={btnClass("lime", "w-full")}>
        {wallet ? "Finish your brand profile" : "Set up your brand"}
      </Link>
    </Card>
  );
}
