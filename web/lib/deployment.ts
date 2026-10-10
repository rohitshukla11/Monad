/**
 * Contract addresses on Monad testnet, from deployments/monad-testnet.json (deployed 2026-10-05 UTC,
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
  startBlock: 68463943,
  CreatorRegistry: "0x680A55c0Db4B44def9d88cCBF450C1f5dd37fd9a",
  LicenseRegistry: "0x87934d5E1A61be3Bb06FE54AC7e21E7704731d1C",
  LicenseEscrow: "0x38703a57c5f8eB2F8d1576A3d2B4B35A10D66FA6",
  ReceiptAnchor: "0xE33Dc788C060cb77F79A2AFF96Ca685f6C018721",
};

export function requireAddress(name: "CreatorRegistry" | "LicenseRegistry" | "LicenseEscrow" | "ReceiptAnchor"): Address {
  const a = deployment[name];
  if (!a) throw new Error(`${name} is not deployed yet`);
  return a;
}
