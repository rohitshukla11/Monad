"use client";

import Link from "next/link";
import { useState } from "react";
import { actionMessage } from "@/lib/auth";
import { api, reason } from "@/lib/client/tx";
import { Badge, Button, Card, H2, Note, Tx } from "@/components/ui";
import { useWallet } from "@/components/wallet/WalletProvider";

type R = {
  assetHash: string;
  licenceId: string;
  renderIndex: number;
  provider: string;
  model: string;
  test: boolean;
  state: string;
  tx?: string;
  confirmMs?: number;
  gasUsed?: string;
  createdAt: number;
  download?: string;
};

/** A brand's renders. Listing with download links needs a wallet signature ("list renders"). */
export function Renders() {
  const { wallet } = useWallet();
  const [rows, setRows] = useState<R[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!wallet) return null;

  async function load() {
    try {
      const message = actionMessage("list renders", { wallet: wallet!.address.toLowerCase() });
      const auth = { message, signature: await wallet!.client.signMessage({ account: wallet!.client.account, message }) };
      setRows((await api<{ renders: R[] }>("/api/renders", { method: "POST", body: JSON.stringify({ licensee: wallet!.address, auth }) })).renders);
    } catch (e) {
      setMsg(reason(e));
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <H2>Your renders</H2>
        <Button kind="secondary" onClick={load}>
          {rows ? "Refresh" : "Show my renders"}
        </Button>
      </div>
      {msg && <Note tone="down">{msg}</Note>}
      {rows?.length === 0 && <Note tone="dim">No renders yet.</Note>}
      <div className="grid grid-cols-3 gap-4">
        {rows?.map((r) => (
          <div key={r.assetHash} className="space-y-2 rounded-card border border-line-soft p-3">
            {r.download ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.download} alt={`Licence ${r.licenceId} render ${r.renderIndex}`} className="aspect-square w-full rounded-card object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-card bg-surface text-xs text-dim">awaiting payment</div>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span>
                #{r.licenceId} · render {r.renderIndex}
              </span>
              {r.test && <Badge tone="warn">TEST RENDER</Badge>}
            </div>
            {r.tx && <Tx hash={r.tx} ms={r.confirmMs} />}
            <Link className="block text-xs text-blue" href={`/verify?hash=${r.assetHash}`}>
              Verify →
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}
