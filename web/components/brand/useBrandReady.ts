"use client";
import { useEffect, useState } from "react";
import { brandStatus } from "@/lib/client/brand-session";
import { useWallet } from "@/components/wallet/WalletProvider";

/** Does the active wallet have a completed brand profile? false while unknown or signed out. */
export function useBrandReady(): boolean {
  const { wallet } = useWallet();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!wallet) return;
    let live = true;
    brandStatus(wallet.address)
      .then((s) => live && setReady(s.complete))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [wallet]);
  return ready;
}
