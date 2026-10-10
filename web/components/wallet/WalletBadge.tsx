"use client";

import { useLogout } from "@dynamic-labs-sdk/react-hooks";
import Link from "next/link";
import type { Address } from "viem";
import { useDynamicState } from "@/app/providers";
import { CreatorFace } from "@/components/ds";
import { useProfiles } from "@/lib/client/profiles";
import { useWallet } from "./WalletProvider";

/** Header identity: the wallet the app is acting as (DEV wallets marked), and the per-tab DEV picker. */
export function WalletBadge() {
  const { wallet, devWallets, useDev } = useWallet();
  const dynamic = useDynamicState();
  const profiles = useProfiles(wallet ? [wallet.address] : []);
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-[15px]">
      {devWallets.length > 0 && (
        <select
          aria-label="Act as a DEV test wallet in this tab"
          value={wallet?.kind === "dev" ? wallet.address : ""}
          onChange={(e) => useDev((e.target.value || null) as Address | null)}
          className="min-h-11 rounded-full border border-ink-line-2 bg-ink-raised px-3 text-[14px] text-white"
        >
          <option value="">{dynamic === "ready" ? "My wallet" : "No wallet"}</option>
          {devWallets.map((w) => (
            <option key={w.address} value={w.address}>
              {w.role === "brand" ? "Brand" : "Creator"}: {w.label}
            </option>
          ))}
        </select>
      )}
      {wallet ? (
        <span className="flex items-center gap-3">
          {wallet.kind === "dev" && <span className="rounded-full bg-lime px-2.5 py-1 text-[12px] font-bold text-ink">DEV</span>}
          <span className="tnum font-medium" title={`${wallet.label}: ${wallet.address}`}>
            {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
          </span>
          <CreatorFace seed={wallet.address} photo={profiles[wallet.address.toLowerCase()]?.photo} size={52} />
          {wallet.kind === "dynamic" && dynamic === "ready" && <SignOut />}
        </span>
      ) : (
        <Link href="/onboard" className="inline-flex min-h-11 items-center rounded-full border border-ink-line-2 px-5 font-semibold text-white no-underline hover:border-lime">
          {dynamic === "off" ? "Wallets off" : "Sign in"}
        </Link>
      )}
    </div>
  );
}

/** Ends the Dynamic session in this browser (the embedded wallet itself is kept by Dynamic). */
function SignOut() {
  const logout = useLogout();
  return (
    <button
      type="button"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      className="inline-flex min-h-11 items-center rounded-full border border-ink-line-2 px-4 text-[14px] font-semibold text-white hover:border-lime disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
