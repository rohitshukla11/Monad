"use client";
/**
 * Browser-side contract writes. Monad charges the gas limit, so every write estimates first and adds
 * 15%. Each returns the hash and how long the receipt took, which the UI shows next to the explorer link.
 */
import { createPublicClient, http, type Abi, type ContractFunctionArgs, type ContractFunctionName, type Hex, type TransactionReceipt } from "viem";
import { monadTestnet } from "@/lib/chain";
import type { ActiveWallet } from "@/components/wallet/WalletProvider";

export const browserPub = createPublicClient({ chain: monadTestnet, transport: http() });

export async function write<const abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable" | "payable">>(
  wallet: ActiveWallet,
  call: { address: `0x${string}`; abi: abi; functionName: fn; args: ContractFunctionArgs<abi, "nonpayable" | "payable", fn> },
): Promise<{ hash: Hex; ms: number; receipt: TransactionReceipt }> {
  const params = { account: wallet.address, ...call } as never;
  const gas = await browserPub.estimateContractGas(params);
  const hash = await wallet.client.writeContract({ ...(call as object), chain: monadTestnet, account: wallet.client.account, gas: (gas * 115n) / 100n } as never);
  const t = performance.now();
  const receipt = await browserPub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transaction reverted: ${hash}`);
  const ms = Math.round(performance.now() - t);
  // Timing log for the operator (server log only; hashes are public anyway).
  void fetch("/api/txlog", { method: "POST", body: JSON.stringify({ hash, fn: String(call.functionName), from: wallet.address, ms, gasUsed: receipt.gasUsed.toString() }) }).catch(() => {});
  return { hash, ms, receipt };
}

/** Pull a contract's custom error name out of a viem error, for a readable message. */
export function reason(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string } } };
  const name = err.cause?.data?.errorName;
  return name ? `${name}${err.shortMessage ? ` (${err.shortMessage})` : ""}` : (err.shortMessage ?? err.message ?? String(e));
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `${url} ${r.status}`);
  return j as T;
}
