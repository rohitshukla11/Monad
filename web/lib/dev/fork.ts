/**
 * DEV/TEST ONLY: a local anvil fork of Monad testnet, with the real deployed contracts and Circle's
 * real USDC contract. The protocol owner is impersonated to point the attester and render agent at
 * throwaway test keys, and USDC balances are written straight into the token's storage. Nothing here
 * touches the public chain.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  erc20Abi,
  http,
  keccak256,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CreatorRegistryAbi } from "@/lib/abi/CreatorRegistry";
import { LicenseEscrowAbi } from "@/lib/abi/LicenseEscrow";
import { monadTestnet, USDC } from "@/lib/chain";
import { deployment } from "@/lib/deployment";

export const anvilBin = process.env.ANVIL_BIN ?? `${homedir()}/.foundry/bin/anvil`;
export const hasAnvil = () => existsSync(anvilBin);

export type Fork = {
  url: string;
  chain: ReturnType<typeof defineChain>;
  pub: ReturnType<typeof createPublicClient>;
  test: ReturnType<typeof createTestClient>;
  forkBlock: bigint;
  stop(): void;
};

export async function startFork(port: number, upstream = process.env.FORK_UPSTREAM_RPC ?? "https://testnet-rpc.monad.xyz"): Promise<Fork> {
  const proc: ChildProcess = spawn(anvilBin, ["--fork-url", upstream, "--port", String(port), "--silent", "--no-rate-limit"], { stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  const chain = defineChain({ ...monadTestnet, rpcUrls: { default: { http: [url] } } });
  const pub = createPublicClient({ chain, transport: http(url) });
  const test = createTestClient({ chain, transport: http(url), mode: "anvil" });
  for (let i = 0; i < 150; i++) {
    try {
      const forkBlock = await pub.getBlockNumber();
      return { url, chain, pub, test, forkBlock, stop: () => proc.kill() };
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  proc.kill();
  throw new Error("anvil fork did not start");
}

/** Point the deployed contracts' attester and render agent at test keys (owner impersonated). */
export async function takeOverRoles(fork: Fork, roles: { attester: Address; agent: Address }) {
  const owner = (await fork.pub.readContract({ address: deployment.CreatorRegistry!, abi: CreatorRegistryAbi, functionName: "owner" })) as Address;
  await fork.test.impersonateAccount({ address: owner });
  await fork.test.setBalance({ address: owner, value: parseEther("10") });
  const ownerWallet = createWalletClient({ chain: fork.chain, transport: http(fork.url), account: owner });
  for (const call of [
    { address: deployment.CreatorRegistry!, abi: CreatorRegistryAbi, functionName: "setAttester", args: [roles.attester] },
    { address: deployment.LicenseEscrow!, abi: LicenseEscrowAbi, functionName: "setRenderAgent", args: [roles.agent, true] },
  ] as const) {
    const hash = await ownerWallet.writeContract(call as never);
    await fork.pub.waitForTransactionReceipt({ hash });
  }
  await fork.test.stopImpersonatingAccount({ address: owner });
}

/** Circle's FiatToken keeps balances in a mapping; find its slot once, then write any balance. */
export async function dealUsdc(fork: Fork, to: Address, amount: bigint) {
  for (let slot = 0n; slot < 20n; slot++) {
    const key = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [to, slot]));
    const before = await fork.pub.getStorageAt({ address: USDC, slot: key });
    await fork.test.setStorageAt({ address: USDC, index: key, value: `0x${amount.toString(16).padStart(64, "0")}` as Hex });
    const bal = await fork.pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [to] });
    if (bal === amount) return;
    await fork.test.setStorageAt({ address: USDC, index: key, value: (before ?? `0x${"0".repeat(64)}`) as Hex });
  }
  throw new Error("could not find USDC's balance slot");
}

export function wallet(fork: Fork, key: Hex) {
  return createWalletClient({ chain: fork.chain, transport: http(fork.url), account: privateKeyToAccount(key) });
}
