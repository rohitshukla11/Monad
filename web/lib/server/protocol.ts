import "server-only";
/**
 * Read model for pages and APIs. Lists come from the history source (Envio, else the RPC scan);
 * every status, term and balance shown is read from the contracts at request time, so a stale index
 * can hide a row for a few seconds but never show a revoked licence as active.
 */
import type { Address, Hex } from "viem";
import { CreatorRegistryAbi } from "@/lib/abi/CreatorRegistry";
import { LicenseEscrowAbi } from "@/lib/abi/LicenseEscrow";
import { LicenseRegistryAbi } from "@/lib/abi/LicenseRegistry";
import { ReceiptAnchorAbi } from "@/lib/abi/ReceiptAnchor";
import { requireAddress } from "@/lib/deployment";
import { STATUS, trustOf, type Licence, type Terms, type Trust } from "@/lib/licensing";
import { pub } from "./chain";
import { history } from "./index";

export type CreatorView = {
  address: Address;
  payout: Address;
  referenceSetHash: Hex;
  verifiedAt: number;
  trust: Trust;
  terms: Terms;
  epoch: number;
  active: boolean;
  suspended: boolean;
  canLicense: boolean;
  registeredAt?: number;
  registeredTx?: Hex;
  /** Last re-verification at a higher level (CreatorRegistry.AttestationUpdated), if any. */
  upgradedAt?: number;
  upgradedTx?: Hex;
};

export type EscrowAccount = { deposited: bigint; paidToCreator: bigint; fees: bigint; refunded: bigint; balance: bigint };

export async function readCreator(address: Address): Promise<CreatorView | null> {
  const c = await pub().readContract({ address: requireAddress("CreatorRegistry"), abi: CreatorRegistryAbi, functionName: "creator", args: [address] });
  if (!c.registered) return null;
  return {
    address: address.toLowerCase() as Address,
    payout: c.payout,
    referenceSetHash: c.attestation.referenceSetHash,
    verifiedAt: Number(c.attestation.verifiedAt),
    trust: trustOf(c.attestation.livenessProvider, c.attestation.ageProvider),
    terms: { ...c.terms },
    epoch: Number(c.epoch),
    active: c.active,
    suspended: c.suspended,
    canLicense: c.active && !c.suspended,
  };
}

/** Registration and the latest upgrade, from history. */
async function withHistory(v: CreatorView): Promise<CreatorView> {
  const h = await history();
  const reg = h.creators.find((r) => r.creator === v.address);
  const up = (h.attestationUpdates ?? []).filter((r) => r.creator === v.address).sort((a, b) => b.block - a.block)[0];
  return { ...v, registeredAt: reg?.timestamp, registeredTx: reg?.tx, upgradedAt: up?.timestamp, upgradedTx: up?.tx };
}

export async function readCreatorWithHistory(address: Address): Promise<CreatorView | null> {
  const v = await readCreator(address);
  return v && withHistory(v);
}

export async function listCreators(): Promise<CreatorView[]> {
  const h = await history();
  const views = await Promise.all(
    h.creators.map(async (r): Promise<CreatorView | null> => {
      const v = await readCreator(r.creator);
      return v && withHistory(v);
    }),
  );
  return views.filter((v): v is CreatorView => v !== null);
}

export async function readLicence(id: bigint): Promise<Licence | null> {
  const registry = requireAddress("LicenseRegistry");
  const [l, s] = await Promise.all([
    pub().readContract({ address: registry, abi: LicenseRegistryAbi, functionName: "licence", args: [id] }),
    pub().readContract({ address: registry, abi: LicenseRegistryAbi, functionName: "status", args: [id] }),
  ]);
  if (l.creator === "0x0000000000000000000000000000000000000000") return null;
  return {
    id,
    creator: l.creator.toLowerCase() as Address,
    licensee: l.licensee.toLowerCase() as Address,
    start: l.start,
    end: l.end,
    category: l.category,
    regions: l.regions,
    renderCap: l.renderCap,
    renderCount: l.renderCount,
    creatorEpoch: l.creatorEpoch,
    revoked: l.revoked,
    pricePerRender: l.pricePerRender,
    purposeHash: l.purposeHash,
    status: STATUS[s],
  };
}

export async function readEscrow(id: bigint): Promise<EscrowAccount> {
  const a = await pub().readContract({ address: requireAddress("LicenseEscrow"), abi: LicenseEscrowAbi, functionName: "account", args: [id] });
  return { ...a, balance: a.deposited - a.paidToCreator - a.fees - a.refunded };
}

/**
 * Licences by party. The licence registry is enumerable by id (licenceCount), so this does not depend
 * on the index at all: it reads every licence and filters. Fine at testnet scale; the indexer path
 * replaces it when ENVIO_GRAPHQL_URL is set.
 */
export async function listLicences(filter: { creator?: Address; licensee?: Address } = {}): Promise<Licence[]> {
  const h = await history();
  const want = (l: { creator: string; licensee: string }) =>
    (!filter.creator || l.creator === filter.creator.toLowerCase()) && (!filter.licensee || l.licensee === filter.licensee.toLowerCase());
  let ids: bigint[];
  if (h.source === "envio") {
    ids = h.licences.filter(want).map((l) => BigInt(l.id));
  } else {
    const count = await pub().readContract({ address: requireAddress("LicenseRegistry"), abi: LicenseRegistryAbi, functionName: "licenceCount" });
    ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  }
  const all = await Promise.all(ids.map(readLicence));
  return all.filter((l): l is Licence => l !== null && want(l)).sort((a, b) => Number(b.id - a.id));
}

export type ReceiptView = { assetHash: Hex; licenceId: bigint; renderIndex: number; timestamp: number };

export async function readReceipt(assetHash: Hex): Promise<ReceiptView | null> {
  const [found, r] = await pub().readContract({ address: requireAddress("ReceiptAnchor"), abi: ReceiptAnchorAbi, functionName: "receiptOf", args: [assetHash] });
  if (!found) return null;
  return { assetHash, licenceId: r.licenceId, renderIndex: r.renderIndex, timestamp: Number(r.timestamp) };
}

/** When a licence stopped being usable by revocation: its own revoke, a revoke-all or a suspension. */
export async function revokedAt(l: Licence): Promise<{ timestamp: number; tx: Hex; how: "licence" | "all" | "suspension" } | null> {
  const h = await history();
  const own = h.revocations.find((r) => r.id === l.id.toString());
  if (own) return { timestamp: own.timestamp, tx: own.tx, how: "licence" };
  const all = h.revokeAlls.filter((r) => r.creator === l.creator && r.epoch > Number(l.creatorEpoch)).sort((a, b) => a.block - b.block)[0];
  const sus = h.suspensions.filter((r) => r.creator === l.creator && r.suspended && r.epoch > Number(l.creatorEpoch)).sort((a, b) => a.block - b.block)[0];
  const first = [all && { ...all, how: "all" as const }, sus && { ...sus, how: "suspension" as const }].filter(Boolean).sort((a, b) => a!.block - b!.block)[0];
  return first ? { timestamp: first.timestamp, tx: first.tx, how: first.how } : null;
}
