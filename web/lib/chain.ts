/**
 * Monad testnet, from https://docs.monad.xyz/developer-essentials/testnet.md.
 *
 * Not viem's built-in `monadTestnet` (viem 2.57): its explorer, testnet.monadexplorer.com, and its
 * multicall `blockCreated` predate the testnet reset of 2025-12-16.
 */
import { defineChain, type Address } from "viem";

export const monadTestnet = defineChain({
  id: 10_143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  contracts: {
    // Canonical deployment, listed on the testnet page above.
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

/** Circle USDC, 6 decimals: https://developers.circle.com/stablecoins/usdc-contract-addresses */
export const USDC: Address = "0x534b2f3A21130d7a60830c2Df862319e593943A3";

export const explorer = {
  tx: (hash: string) => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`,
  address: (a: string) => `${monadTestnet.blockExplorers.default.url}/address/${a}`,
};
