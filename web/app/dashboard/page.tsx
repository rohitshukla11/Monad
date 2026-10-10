"use client";

import { BrandDashboard } from "@/components/dashboard/BrandDashboard";
import { CreatorDashboard } from "@/components/dashboard/CreatorDashboard";
import { Card, Note } from "@/components/ui";
import { useWallet } from "@/components/wallet/WalletProvider";

export default function Dashboard() {
  const { wallet, devWallets } = useWallet();
  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
      {!wallet ? (
        <Card>
          <Note>
            Sign in on the <a className="text-blue" href="/onboard">creator page</a> first
            {devWallets.length > 0 ? ", or pick a DEV wallet in the header" : ""}.
          </Note>
        </Card>
      ) : (
        <>
          <CreatorDashboard />
          <BrandDashboard />
        </>
      )}
    </div>
  );
}
