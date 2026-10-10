"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { btnClass, NoticePage, Page, Skeleton } from "@/components/ds";
import { BrandView } from "@/components/dashboard/BrandView";
import { CreatorView, type CreatorJson } from "@/components/dashboard/CreatorView";
import { useWallet } from "@/components/wallet/WalletProvider";

/** One dashboard, two audiences: a registered creator sees the creator view, a brand its own; a wallet that is both can switch. */
export default function Dashboard() {
  const { wallet } = useWallet();
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
      <NoticePage
        title="Dashboard"
        description="Your likeness, your licences and what you've earned."
        action={
          <Link href="/onboard" className={btnClass("ink")}>
            Sign in
          </Link>
        }
      >
        Sign in to see your licences, earnings and renders.
      </NoticePage>
    );
  if (creator === undefined)
    return (
      <div role="status" aria-label="Loading your dashboard">
        <Page>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-[18px] desk:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
          <span className="sr-only">Loading your dashboard…</span>
        </Page>
      </div>
    );

  const view = creator && as === "creator" ? "creator" : "brand";
  // A wallet that is both a creator and a brand switches views in the page header.
  const toggle = creator ? (
    <div role="group" aria-label="View as" className="grid grid-cols-2 rounded-[12px] bg-white p-1 text-[13px] font-semibold shadow-[inset_0_0_0_1px_#DADDD5]">
      {(["creator", "brand"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => setAs(v)} className={`min-h-9 rounded-[9px] px-3.5 capitalize ${view === v ? "bg-ink text-white" : "text-grey hover:text-ink"}`}>
          {v}
        </button>
      ))}
    </div>
  ) : undefined;
  return view === "creator" && creator ? <CreatorView wallet={wallet} creator={creator} onChanged={load} toggle={toggle} /> : <BrandView wallet={wallet} toggle={toggle} />;
}
