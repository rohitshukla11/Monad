import "server-only";
/**
 * Server-side chain access. The RPC is read at call time, so a test or the local demo can point the
 * whole server at an anvil fork of Monad testnet (MONAD_RPC_URL) without touching the browser config.
 */
import { createPublicClient, defineChain, http, type PublicClient } from "viem";
import { monadTestnet } from "@/lib/chain";

export function rpcUrl(): string {
  return process.env.MONAD_RPC_URL || process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
}

/** True when the server is pointed at a local fork rather than the public testnet. */
export function isLocalFork(): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(rpcUrl());
}

export function serverChain() {
  return defineChain({ ...monadTestnet, rpcUrls: { default: { http: [rpcUrl()] } } });
}

const clients = new Map<string, PublicClient>();
export function pub(): PublicClient {
  const url = rpcUrl();
  let c = clients.get(url);
  if (!c) {
    // Contract reads issued together go out as one Multicall3 call, and retries back off: the public
    // Monad RPC allows about 15 requests a second.
    c = createPublicClient({
      chain: serverChain(),
      batch: { multicall: { wait: 16 } },
      transport: http(url, { retryCount: 5, retryDelay: 400 }),
    }) as PublicClient;
    clients.set(url, c);
  }
  return c;
}

/** Monad charges the gas limit, not gas used: estimate, then add a small margin. */
export const withMargin = (gas: bigint) => (gas * 115n) / 100n;

/**
 * Process-wide singletons. Next's dev server can load a module once per route bundle, so state that
 * must be shared across routes (in-memory keys, caches) hangs off globalThis.
 */
export function singleton<T>(name: string, make: () => T): T {
  const g = globalThis as unknown as Record<string, T>;
  const key = `__likeness_${name}`;
  if (!(key in g)) g[key] = make();
  return g[key];
}
