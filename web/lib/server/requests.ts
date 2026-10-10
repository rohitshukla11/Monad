import "server-only";
/**
 * Licence requests that need the creator's signature. The brand files the exact request (and its
 * brief); the creator signs the EIP-712 Approval in their own wallet; the brand then submits
 * LicenseRegistry.request with that signature. The server only relays: it checks each signature
 * against the request before storing it, but the contract is what accepts or rejects it.
 * Requests inside a creator's auto-approve terms skip this and go straight to the contract.
 */
import { randomBytes } from "node:crypto";
import { isAddress, recoverTypedDataAddress, verifyMessage, type Address, type Hex } from "viem";
import { isLicensable } from "@/lib/categories";
import { requireAddress } from "@/lib/deployment";
import { approvalTypedData, declineMessage, purposeHash, type LicenceRequest, type PurposeBrief } from "@/lib/licensing";
import { dbGet, dbList, dbPut } from "./db";
import { serverChain } from "./chain";
import { readCreator } from "./protocol";

export type StoredRequest = {
  id: string;
  createdAt: number;
  licensee: Address;
  request: { [K in keyof LicenceRequest]: string | number };
  brief: PurposeBrief;
  state: "pending" | "approved" | "declined";
  signature?: Hex;
  decidedAt?: number;
};

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX = { campaign: 120, brand: 80, use: 1000 };

export function toRequest(r: StoredRequest["request"]): LicenceRequest {
  return {
    creator: r.creator as Address,
    category: Number(r.category),
    regions: Number(r.regions),
    duration: BigInt(r.duration),
    renderCap: Number(r.renderCap),
    pricePerRender: BigInt(r.pricePerRender),
    purposeHash: r.purposeHash as Hex,
    deadline: BigInt(r.deadline),
    salt: r.salt as Hex,
  };
}

/** Store the brief so anyone holding a licence's purposeHash can read what it was for. */
export async function saveBrief(brief: PurposeBrief): Promise<Hex> {
  if (!brief.brand?.trim() || !brief.campaign?.trim() || !brief.use?.trim()) throw new RequestError(400, "brief needs brand, campaign and intended use");
  if (brief.brand.length > MAX.brand || brief.campaign.length > MAX.campaign || brief.use.length > MAX.use) throw new RequestError(400, "brief too long");
  const h = purposeHash(brief);
  await dbPut("briefs", h, { brand: brief.brand.trim(), campaign: brief.campaign.trim(), use: brief.use.trim() });
  return h;
}

export const getBrief = (h: Hex) => dbGet<PurposeBrief>("briefs", h);

export async function fileRequest(input: {
  licensee: string;
  creator: string;
  category: number;
  regions: number;
  durationDays: number;
  renderCap: number;
  pricePerRender: string;
  brief: PurposeBrief;
}): Promise<StoredRequest> {
  if (!isAddress(input.licensee) || !isAddress(input.creator)) throw new RequestError(400, "bad address");
  if (!isLicensable(input.category)) throw new RequestError(400, "category must be one allowed use (banned uses can never be licensed)");
  if (!input.regions) throw new RequestError(400, "pick at least one region");
  const days = Number(input.durationDays);
  if (!(days >= 1 && days <= 365)) throw new RequestError(400, "duration must be 1 to 365 days");
  if (!(input.renderCap >= 1 && input.renderCap <= 1_000_000)) throw new RequestError(400, "bad render cap");
  const price = BigInt(input.pricePerRender);
  if (price <= 0n) throw new RequestError(400, "price must be positive");
  const creator = await readCreator(input.creator as Address);
  if (!creator?.canLicense) throw new RequestError(409, "this creator is not accepting licences");

  const h = await saveBrief(input.brief);
  const req: StoredRequest = {
    id: randomBytes(9).toString("base64url"),
    createdAt: Date.now(),
    licensee: input.licensee.toLowerCase() as Address,
    request: {
      creator: input.creator.toLowerCase(),
      category: input.category,
      regions: input.regions,
      duration: String(days * 86_400),
      renderCap: input.renderCap,
      pricePerRender: price.toString(),
      purposeHash: h,
      deadline: String(Math.floor(Date.now() / 1000) + 7 * 86_400), // creator's signature is good for a week
      salt: `0x${randomBytes(32).toString("hex")}`,
    },
    brief: input.brief,
    state: "pending",
  };
  await dbPut("requests", req.id, req);
  return req;
}

export async function listRequests(filter: { creator?: string; licensee?: string }): Promise<StoredRequest[]> {
  const all = await dbList<StoredRequest>("requests");
  return all
    .filter((r) => (!filter.creator || r.request.creator === filter.creator.toLowerCase()) && (!filter.licensee || r.licensee === filter.licensee.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export const getRequest = (id: string) => dbGet<StoredRequest>("requests", id);

/** The creator's decision. An approval must be the creator's own EIP-712 signature over this request. */
export async function decide(id: string, decision: { approve: boolean; signature: Hex }) {
  const r = await getRequest(id);
  if (!r) throw new RequestError(404, "no such request");
  if (r.state !== "pending") throw new RequestError(409, `request already ${r.state}`);
  const request = toRequest(r.request);
  if (decision.approve) {
    const typed = approvalTypedData(serverChain().id, requireAddress("LicenseRegistry"), request, r.licensee);
    const signer = await recoverTypedDataAddress({ ...typed, signature: decision.signature });
    if (signer.toLowerCase() !== request.creator.toLowerCase()) throw new RequestError(403, "approval is not signed by the creator");
    Object.assign(r, { state: "approved", signature: decision.signature, decidedAt: Date.now() });
  } else {
    // Declining is a signed plain message, so only the creator can decline.
    const ok = await verifyMessage({ address: request.creator, message: declineMessage(id), signature: decision.signature });
    if (!ok) throw new RequestError(403, "decline is not signed by the creator");
    Object.assign(r, { state: "declined", decidedAt: Date.now() });
  }
  await dbPut("requests", r.id, r);
  return r;
}
