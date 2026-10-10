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
  startBlock: 69778020,
  CreatorRegistry: "0xe96FB286F36372EffCF846F8a0d25773D63A3618",
  LicenseRegistry: "0x69e3A6856ef324205D67CAA4F16220436f324f45",
  LicenseEscrow: "0xB72a55D7181A1605FCB70a665e4B408992169201",
  ReceiptAnchor: "0xF65313C01b2E252bedfd79cAB266Fab2b14D4C1f",
};

export function requireAddress(name: "CreatorRegistry" | "LicenseRegistry" | "LicenseEscrow" | "ReceiptAnchor"): Address {
  const a = deployment[name];
  if (!a) throw new Error(`${name} is not deployed yet`);
  return a;
}
