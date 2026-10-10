"use client";

import type { Address } from "viem";
import { useDynamicState } from "@/app/providers";
import { useWallet } from "./WalletProvider";

/** Header: which wallet the app is acting as. Dev wallets are always marked DEV. */
export function WalletBadge() {
  const { wallet, devWallets, useDev } = useWallet();
  const dynamic = useDynamicState();
  return (
    <div className="flex items-center gap-3 text-xs">
      {wallet ? (
        <span className="flex items-center gap-2">
          {wallet.kind === "dev" && <span className="rounded-full border border-warn/50 px-2 py-0.5 font-semibold text-warn">DEV</span>}
          <span className="tnum font-mono text-muted" title={wallet.label}>
            {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
          </span>
        </span>
      ) : (
        <span className="text-dim">{dynamic === "off" ? "Wallets off (no Dynamic env ID)" : "Not signed in"}</span>
      )}
      {devWallets.length > 0 && (
        <select
          aria-label="Act as a seeded dev wallet"
          value={wallet?.kind === "dev" ? wallet.address : ""}
          onChange={(e) => useDev((e.target.value || null) as Address | null)}
          className="rounded-full border border-warn/40 bg-surface px-2 py-1 text-warn"
        >
          <option value="">{dynamic === "ready" ? "Dynamic wallet" : "No wallet"}</option>
          {devWallets.map((w) => (
            <option key={w.address} value={w.address}>
              DEV: {w.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
