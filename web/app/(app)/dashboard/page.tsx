"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppPage, pillClass } from "@/components/ds";
import { BrandView } from "@/components/dashboard/BrandView";
import { CreatorView, type CreatorJson } from "@/components/dashboard/CreatorView";
import { useWallet } from "@/components/wallet/WalletProvider";

/** One dashboard, two audiences: a registered creator sees the creator view, a brand its own; a wallet that is both can switch. */
export default function Dashboard() {
  const { wallet, devWallets } = useWallet();
  const [creator, setCreator] = useState<CreatorJson | null | undefined>(undefined);
  const [as, setAs] = useState<"creator" | "brand">("creator");

  const load = useCallback(async () => {
    if (!wallet) return;
    const r = await fetch(`/api/creators/${wallet.address}`, { cache: "no-store" });
    setCreator(r.status === 404 ? null : ((await r.json()).creator as CreatorJson));
  }, [wallet]);
  useEffect(() => {
    setCreator(undefined);
    load().catch(() => setCreator(null));
  }, [load]);

  if (!wallet)
    return (
      <AppPage title="Dashboard">
        <div className="flex flex-col items-start gap-4 rounded-[26px] bg-white p-6">
          <p className="m-0 text-[17px]">Sign in to see your licences, earnings and renders.</p>
          <Link href="/onboard" className={pillClass("ink")}>
            Sign in
          </Link>
          {devWallets.length > 0 && <p className="m-0 text-[14px] text-grey">Or pick a DEV test wallet in the header.</p>}
        </div>
      </AppPage>
    );
  if (creator === undefined)
    return (
      <AppPage title="Dashboard">
        <p role="status" className="m-0 text-[17px] text-grey">
          Loading your dashboard…
        </p>
      </AppPage>
    );

  const view = creator && as === "creator" ? "creator" : "brand";
  return (
    <>
      {creator && (
        <div className="mx-auto flex max-w-[1320px] justify-end px-4 pt-4 sm:px-8">
          <div role="group" aria-label="Dashboard view" className="flex rounded-full bg-ink-raised p-1 text-[14px]">
            {(["creator", "brand"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setAs(v)}
                className={`min-h-11 rounded-full px-4 font-semibold ${view === v ? "bg-lime text-ink" : "text-white"}`}
              >
                As {v}
              </button>
            ))}
          </div>
        </div>
      )}
      {view === "creator" && creator ? <CreatorView wallet={wallet} creator={creator} onChanged={load} /> : <BrandView wallet={wallet} />}
    </>
  );
}
