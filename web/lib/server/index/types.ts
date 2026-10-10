/**
 * Normalised protocol history. Both sources produce exactly this shape: the Envio HyperIndex
 * GraphQL API (indexer/) and, when no indexer is configured, an incremental RPC log scan.
 */
import type { Address, Hex } from "viem";

type At = { block: number; timestamp: number; tx: Hex; logIndex: number };

export type CreatorRegisteredRow = At & { creator: Address; payout: Address; referenceSetHash: Hex };
export type TermsSetRow = At & { creator: Address };
export type AttestationUpdatedRow = At & { creator: Address; referenceSetHash: Hex; verifiedAt: number };
export type LicenceIssuedRow = At & {
  id: string;
  creator: Address;
  licensee: Address;
  category: number;
  regions: number;
  end: number;
  renderCap: number;
  pricePerRender: string;
  purposeHash: Hex;
  autoApproved: boolean;
};
export type LicenceRevokedRow = At & { id: string; creator: Address };
export type AllRevokedRow = At & { creator: Address; epoch: number };
export type SuspendedRow = At & { creator: Address; suspended: boolean; epoch: number };
export type DepositedRow = At & { licenceId: string; licensee: Address; amount: string };
export type RenderPaidRow = At & {
  licenceId: string;
  renderIndex: number;
  assetHash: Hex;
  agent: Address;
  payout: Address;
  creatorAmount: string;
  fee: string;
};
export type RefundedRow = At & { licenceId: string; licensee: Address; amount: string };

export type History = {
  source: "envio" | "rpc";
  /** Highest block the source has fully processed. */
  head: number;
  creators: CreatorRegisteredRow[];
  terms: TermsSetRow[];
  attestationUpdates: AttestationUpdatedRow[];
  licences: LicenceIssuedRow[];
  revocations: LicenceRevokedRow[];
  revokeAlls: AllRevokedRow[];
  suspensions: SuspendedRow[];
  deposits: DepositedRow[];
  renders: RenderPaidRow[];
  refunds: RefundedRow[];
};

export const emptyHistory = (source: History["source"], head = 0): History => ({
  source,
  head,
  creators: [],
  terms: [],
  attestationUpdates: [],
  licences: [],
  revocations: [],
  revokeAlls: [],
  suspensions: [],
  deposits: [],
  renders: [],
  refunds: [],
});
