import "server-only";
/**
 * One-time MON drip to a new embedded wallet, so creators and brands can pay gas. Dynamic's gas
 * sponsorship does not cover Monad (https://www.dynamic.xyz/docs/embedded-wallets/gas-sponsorship.md).
 *
 * Limits:
 *  - per address: once. Only a wallet with zero MON and nonce 0 qualifies, so the chain itself is the
 *    ledger and the cap survives restarts and multiple instances;
 *  - per IP: DRIP_PER_IP_PER_HOUR (default 3), and per instance: DRIP_PER_HOUR (default 30), in memory;
 *  - every drip and refusal is logged as one JSON line (Vercel function logs).
 */
import { createHash } from "node:crypto";
import { createPublicClient, createWalletClient, http, isAddress, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "@/lib/chain";
import { loadKey } from "./keys";

const HOUR = 3_600_000;
const perIpLimit = Number(process.env.DRIP_PER_IP_PER_HOUR ?? 3);
const globalLimit = Number(process.env.DRIP_PER_HOUR ?? 30);
const amount = parseEther(process.env.DRIP_AMOUNT_MON ?? "0.5");

const byIp = new Map<string, number[]>();
let global: number[] = [];
const inFlight = new Set<string>();

export type DripResult = { status: number; body: Record<string, unknown> };

function log(event: Record<string, unknown>) {
  console.log(JSON.stringify({ at: new Date().toISOString(), service: "drip", ...event }));
}

function recent(times: number[], now: number) {
  return times.filter((t) => now - t < HOUR);
}


export async function drip(addressInput: string, ip: string): Promise<DripResult> {
  const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 12);
  const key = loadKey("DRIP_KEY_FILE", "DRIP_PRIVATE_KEY");
  if (!key) return { status: 503, body: { error: "drip is not configured" } };
  if (!isAddress(addressInput)) return { status: 400, body: { error: "bad address" } };
  const address = addressInput.toLowerCase() as Address;

  const now = Date.now();
  const ipTimes = recent(byIp.get(ipHash) ?? [], now);
  global = recent(global, now);
  if (ipTimes.length >= perIpLimit || global.length >= globalLimit) {
    log({ result: "rate-limited", address, ipHash });
    return { status: 429, body: { error: "rate limited, try later" } };
  }
  if (inFlight.has(address)) return { status: 409, body: { error: "already in progress" } };

  const transport = http(monadTestnet.rpcUrls.default.http[0]);
  const pub = createPublicClient({ chain: monadTestnet, transport });
  inFlight.add(address);
  try {
    const [balance, nonce] = await Promise.all([pub.getBalance({ address }), pub.getTransactionCount({ address })]);
    if (balance > 0n || nonce > 0) {
      log({ result: "refused-not-new", address, ipHash });
      return { status: 409, body: { error: "only new, empty wallets get a drip" } };
    }
    const wallet = createWalletClient({ chain: monadTestnet, transport, account: privateKeyToAccount(key) });
    // Monad charges the gas limit, not gas used, so a plain transfer sets exactly 21,000.
    // https://docs.monad.xyz/developer-essentials/gas-pricing.md
    const hash = await wallet.sendTransaction({ to: address, value: amount, gas: 21_000n });
    ipTimes.push(now);
    byIp.set(ipHash, ipTimes);
    global.push(now);
    log({ result: "sent", address, ipHash, amount: amount.toString(), hash });
    return { status: 200, body: { hash, amount: amount.toString() } };
  } catch (e) {
    log({ result: "error", address, ipHash, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
    return { status: 502, body: { error: "drip failed" } };
  } finally {
    inFlight.delete(address);
  }
}
