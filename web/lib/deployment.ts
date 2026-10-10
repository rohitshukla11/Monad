/**
 * Contract addresses on Monad testnet, from deployments/monad-testnet.json (deployed 2026-10-10 UTC,
 * verified on Sourcify). startBlock is CreatorRegistry's creation block, for the indexer.
 */
import type { Address } from "viem";

export const deployment: {
  chainId: 10143;
  startBlock: number | null;
  CreatorRegistry: Address | null;
  LicenseRegistry: Address | null;
  LicenseEscrow: Address | null;
  ReceiptAnchor: Address | null;
} = {
  chainId: 10143,
  startBlock: 69802475,
  CreatorRegistry: "0xc0eadb706D175e317c8D89cD250781fC3d14008B",
  LicenseRegistry: "0x38c8EcA2782fB64C23daB9B3432E668F81Fbacc9",
  LicenseEscrow: "0xf7659B8CFA2A484aE30e638c2490131Bc568dA0A",
  ReceiptAnchor: "0x272b5Bdf04564dA897a66aE84E18c822876d72Fe",
};

export function requireAddress(name: "CreatorRegistry" | "LicenseRegistry" | "LicenseEscrow" | "ReceiptAnchor"): Address {
  const a = deployment[name];
  if (!a) throw new Error(`${name} is not deployed yet`);
  return a;
}
