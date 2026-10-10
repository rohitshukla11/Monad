/**
 * The attester's viem EIP-712 signature must verify inside CreatorRegistry.register. Deploys the real
 * bytecode from contracts/out to a local anvil chain. Skipped when anvil or the build output is absent.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createPublicClient, createWalletClient, http, keccak256, stringToHex, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreatorRegistryAbi } from "@/lib/abi/CreatorRegistry";
import { signAttestation, type Attestation } from "./attest";

const anvilBin = `${homedir()}/.foundry/bin/anvil`;
const artifact = "../contracts/out/CreatorRegistry.sol/CreatorRegistry.json";
const ready = existsSync(anvilBin) && existsSync(artifact);
const PORT = 8547;

// anvil's well-known dev accounts (public test keys, printed by anvil itself).
const deployerKey: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const attesterKey: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const creatorKey: Hex = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

describe.skipIf(!ready)("attester signature against the real CreatorRegistry", () => {
  let anvil: ChildProcess;
  const chain = { ...foundry, rpcUrls: { default: { http: [`http://127.0.0.1:${PORT}`] } } };
  const pub = createPublicClient({ chain, transport: http() });

  beforeAll(async () => {
    anvil = spawn(anvilBin, ["--port", String(PORT), "--silent"]);
    for (let i = 0; i < 50; i++) {
      try {
        await pub.getChainId();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });
  afterAll(() => anvil?.kill());

  it("register() accepts the server's signature and rejects a tampered one", async () => {
    const deployer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(deployerKey) });
    const creator = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(creatorKey) });
    const attester = privateKeyToAccount(attesterKey).address;
    const { bytecode } = JSON.parse(readFileSync(artifact, "utf8"));
    const hash = await deployer.deployContract({
      abi: CreatorRegistryAbi,
      bytecode: bytecode.object as Hex,
      args: [deployer.account.address, attester],
    });
    const registry = (await pub.waitForTransactionReceipt({ hash })).contractAddress!;

    const attestation: Attestation = {
      referenceSetHash: keccak256(toHex("ciphertext manifest")),
      livenessSessionHash: keccak256(toHex("session-id")),
      livenessProvider: stringToHex("didit-sandbox", { size: 32 }),
      ageProvider: stringToHex("didit-sandbox", { size: 32 }),
      verifiedAt: 1n,
      adult: true,
    };
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    const sig = await signAttestation(attesterKey, registry, chain.id, creator.account.address, attestation, 0n, deadline);
    const terms = {
      categories: 1 << 8,
      regions: 1,
      maxDuration: 86_400n,
      maxRenders: 10,
      pricePerRender: 1_000_000n,
      autoApprove: true,
    };

    await expect(
      pub.simulateContract({
        account: creator.account,
        address: registry,
        abi: CreatorRegistryAbi,
        functionName: "register",
        args: [creator.account.address, { ...attestation, verifiedAt: 2n }, deadline, sig, terms],
      }),
    ).rejects.toThrow(/BadAttestation/);

    const tx = await creator.writeContract({
      address: registry,
      abi: CreatorRegistryAbi,
      functionName: "register",
      args: [creator.account.address, attestation, deadline, sig, terms],
    });
    expect((await pub.waitForTransactionReceipt({ hash: tx })).status).toBe("success");
    const stored = await pub.readContract({ address: registry, abi: CreatorRegistryAbi, functionName: "creator", args: [creator.account.address] });
    expect(stored.attestation.referenceSetHash).toBe(attestation.referenceSetHash);
    expect(stored.attestation.ageProvider).toBe(attestation.ageProvider);
  });
});
