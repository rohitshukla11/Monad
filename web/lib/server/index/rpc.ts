import "server-only";
/**
 * The RPC fallback for the indexer: scans the four contracts' logs from the deployment block,
 * 100 blocks per eth_getLogs call (the public Monad testnet RPC's limit), and caches the decoded
 * rows plus a cursor in STORE_DIR/../index-<chain>.json so later reads only fetch new blocks.
 * Current state (status, terms, balances) is always read from the contracts, never from this cache.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEventLogs, type Address, type Hex, type Log } from "viem";
import { CreatorRegistryAbi } from "@/lib/abi/CreatorRegistry";
import { LicenseEscrowAbi } from "@/lib/abi/LicenseEscrow";
import { LicenseRegistryAbi } from "@/lib/abi/LicenseRegistry";
import { deployment, requireAddress } from "@/lib/deployment";
import { pub, rpcUrl, singleton } from "../chain";
import { emptyHistory, type History } from "./types";

const CHUNK = 100n;
const CONCURRENCY = 8;
const abi = [...CreatorRegistryAbi, ...LicenseRegistryAbi, ...LicenseEscrowAbi];

function cacheFile(): string {
  const base = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.INDEX_CACHE_DIR ?? ".data");
  // One cache per RPC endpoint and start block: a local fork and the public testnet must never share
  // rows, and each new fork (same local URL, later start block) starts from an empty cache.
  const tag = createHash("sha256").update(`${rpcUrl()}|${startBlock()}`).digest("base64url").slice(0, 16);
  return path.join(base, `index-${deployment.chainId}-${tag}.json`);
}

function startBlock(): bigint {
  return BigInt(process.env.INDEX_START_BLOCK ?? deployment.startBlock ?? 0);
}

type State = { history: History; scanning: Promise<History> | null; loaded: boolean };
const state = singleton<Map<string, State>>("rpc-index", () => new Map());

async function load(file: string): Promise<History> {
  try {
    const h = JSON.parse(await readFile(file, "utf8")) as History;
    if (h.source === "rpc" && typeof h.head === "number" && h.head >= Number(startBlock()) - 1) {
      // Caches written before AttestationUpdated was tracked: no updateAttestation had been sent yet
      // when that field was added (2026-10-10), so an empty list is exact, and a rescan is avoided.
      h.attestationUpdates ??= [];
      return h;
    }
  } catch {}
  return emptyHistory("rpc", Number(startBlock()) - 1);
}

const lower = (a: string) => a.toLowerCase() as Address;

function apply(h: History, logs: Log[], times: Map<bigint, number>) {
  const events = parseEventLogs({ abi, logs, strict: false });
  for (const e of events) {
    const at = {
      block: Number(e.blockNumber),
      timestamp: times.get(e.blockNumber!) ?? 0,
      tx: e.transactionHash as Hex,
      logIndex: Number(e.logIndex),
    };
    const a = e.args as Record<string, unknown>;
    const src = lower(e.address);
    switch (e.eventName) {
      case "CreatorRegistered":
        h.creators.push({ ...at, creator: lower(a.creator as string), payout: lower(a.payout as string), referenceSetHash: a.referenceSetHash as Hex });
        break;
      case "AttestationUpdated":
        h.attestationUpdates.push({ ...at, creator: lower(a.creator as string), referenceSetHash: a.referenceSetHash as Hex, verifiedAt: Number(a.verifiedAt) });
        break;
      case "TermsSet":
        h.terms.push({ ...at, creator: lower(a.creator as string) });
        break;
      case "AllRevoked":
        h.revokeAlls.push({ ...at, creator: lower(a.creator as string), epoch: Number(a.epoch) });
        break;
      case "Suspended":
        h.suspensions.push({ ...at, creator: lower(a.creator as string), suspended: a.suspended as boolean, epoch: Number(a.epoch) });
        break;
      case "LicenceIssued":
        h.licences.push({
          ...at,
          id: String(a.id),
          creator: lower(a.creator as string),
          licensee: lower(a.licensee as string),
          category: Number(a.category),
          regions: Number(a.regions),
          end: Number(a.end),
          renderCap: Number(a.renderCap),
          pricePerRender: String(a.pricePerRender),
          purposeHash: a.purposeHash as Hex,
          autoApproved: a.autoApproved as boolean,
        });
        break;
      case "LicenceRevoked":
        h.revocations.push({ ...at, id: String(a.id), creator: lower(a.creator as string) });
        break;
      case "Deposited":
        h.deposits.push({ ...at, licenceId: String(a.licenceId), licensee: lower(a.licensee as string), amount: String(a.amount) });
        break;
      case "RenderPaid":
        h.renders.push({
          ...at,
          licenceId: String(a.licenceId),
          renderIndex: Number(a.renderIndex),
          assetHash: a.assetHash as Hex,
          agent: lower(a.agent as string),
          payout: lower(a.payout as string),
          creatorAmount: String(a.creatorAmount),
          fee: String(a.fee),
        });
        break;
      case "Refunded":
        h.refunds.push({ ...at, licenceId: String(a.licenceId), licensee: lower(a.licensee as string), amount: String(a.amount) });
        break;
    }
    void src;
  }
}

async function scan(h: History, file: string): Promise<History> {
  const client = pub();
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const from = BigInt(h.head) + 1n;
  if (from > head) return h;
  const address = [requireAddress("CreatorRegistry"), requireAddress("LicenseRegistry"), requireAddress("LicenseEscrow")];

  const ranges: [bigint, bigint][] = [];
  for (let b = from; b <= head; b += CHUNK) ranges.push([b, b + CHUNK - 1n > head ? head : b + CHUNK - 1n]);
  const logs: Log[] = [];
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      ranges.slice(i, i + CONCURRENCY).map(([fromBlock, toBlock]) => client.getLogs({ address, fromBlock, toBlock })),
    );
    for (const b of batch) logs.push(...(b as Log[]));
  }
  logs.sort((x, y) => Number(x.blockNumber! - y.blockNumber!) || Number(x.logIndex! - y.logIndex!));

  // Monad's RPC returns blockTimestamp on each log; anything else falls back to the block header.
  const times = new Map<bigint, number>();
  for (const l of logs) {
    const ts = (l as Log & { blockTimestamp?: Hex | bigint }).blockTimestamp;
    if (ts !== undefined) times.set(l.blockNumber!, Number(ts));
  }
  const missing = [...new Set(logs.map((l) => l.blockNumber!))].filter((b) => !times.has(b));
  for (const b of missing) times.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp));

  apply(h, logs, times);
  h.head = Number(head);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(h));
  return h;
}

/** History up to the current head. Concurrent callers share one scan. */
export async function rpcHistory(): Promise<History> {
  const file = cacheFile();
  let s = state.get(file);
  if (!s) {
    s = { history: emptyHistory("rpc"), scanning: null, loaded: false };
    state.set(file, s);
  }
  if (!s.loaded) {
    s.history = await load(file);
    s.loaded = true;
  }
  s.history.attestationUpdates ??= []; // see load()
  // Every caller gets a scan that starts no earlier than its call, queued behind any scan in flight
  // (which may have started before the block the caller cares about). A scan with no new blocks is
  // one eth_blockNumber call.
  const current = s;
  const mine: Promise<History> = (current.scanning ?? Promise.resolve(current.history))
    .catch(() => current.history)
    .then(() => scan(current.history, file))
    .then((h) => (current.history = h))
    .finally(() => {
      if (current.scanning === mine) current.scanning = null;
    });
  current.scanning = mine;
  return mine;
}
