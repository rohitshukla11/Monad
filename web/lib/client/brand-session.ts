"use client";
/**
 * A brand's short session for viewing sample renders: one wallet signature, then a server-signed token
 * kept for this tab (sessionStorage) until it expires.
 */
import { actionMessage } from "@/lib/auth";
import type { ActiveWallet } from "@/components/wallet/WalletProvider";
import { api } from "./tx";

const KEY = (a: string) => `likeness:brand-session:${a.toLowerCase()}`;

export function storedBrandSession(address: string): string | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY(address)) ?? "null") as { token: string; exp: number } | null;
    return s && s.exp > Date.now() + 30_000 ? s.token : null;
  } catch {
    return null;
  }
}

export async function startBrandSession(wallet: ActiveWallet): Promise<string> {
  const have = storedBrandSession(wallet.address);
  if (have) return have;
  const message = actionMessage("start brand session", { wallet: wallet.address.toLowerCase() });
  const signature = await wallet.client.signMessage({ account: wallet.client.account, message });
  const r = await api<{ token: string; expiresIn: number }>("/api/brands/session", { method: "POST", body: JSON.stringify({ address: wallet.address, auth: { message, signature } }) });
  try {
    sessionStorage.setItem(KEY(wallet.address), JSON.stringify({ token: r.token, exp: Date.now() + r.expiresIn * 1000 }));
  } catch {}
  return r.token;
}

/** Is this wallet a brand with a completed profile? */
export async function brandStatus(address: string): Promise<{ complete: boolean; name: string | null }> {
  const r = await api<{ brand: { name: string } | null; complete: boolean }>(`/api/brands?address=${address}`);
  return { complete: r.complete, name: r.brand?.name ?? null };
}
