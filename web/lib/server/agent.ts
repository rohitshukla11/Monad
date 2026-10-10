import "server-only";
/**
 * The render agent: the platform key that signs LicenseEscrow's EIP-712 Render attestation ("this exact
 * file was produced under this licence, as render N"). The escrow only pays out with a registered
 * agent's signature.
 *
 * Two implementations behind one interface:
 *  - "dynamic-server-wallet": a Dynamic server wallet (@dynamic-labs-wallet/node-evm). Needs
 *    NEXT_PUBLIC_DYNAMIC_ENV_ID, DYNAMIC_API_KEY and the wallet created by `pnpm agent:dynamic`
 *    (metadata and key shares in DYNAMIC_AGENT_FILE, default ../.secrets/dynamic-agent.json);
 *  - "local-key": a key file (RENDER_AGENT_KEY_FILE). Used until the Dynamic wallet exists.
 * Whichever is used, its address must be registered with LicenseEscrow.setRenderAgent by the owner.
 */
import { secretText } from "./secret";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LicenseEscrowAbi } from "@/lib/abi/LicenseEscrow";
import { requireAddress } from "@/lib/deployment";
import { renderDomain, renderTypes } from "@/lib/licensing";
import { loadKey } from "./keys";
import { pub, serverChain } from "./chain";

export type RenderMessage = { licenceId: bigint; assetHash: Hex; renderIndex: number; deadline: bigint };

export interface RenderAgent {
  kind: "dynamic-server-wallet" | "local-key";
  address: Address;
  signRender(m: RenderMessage): Promise<Hex>;
}

export function renderTypedData(m: RenderMessage) {
  return {
    domain: renderDomain(serverChain().id, requireAddress("LicenseEscrow")),
    types: renderTypes,
    primaryType: "Render" as const,
    message: m,
  };
}


async function dynamicAgent(): Promise<RenderAgent | null> {
  const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID;
  const apiKey = process.env.DYNAMIC_API_KEY;
  const file = secretText("DYNAMIC_AGENT_JSON", "DYNAMIC_AGENT_FILE", "../.secrets/dynamic-agent.json");
  if (!environmentId || !apiKey || !file) return null;
  const saved = JSON.parse(file);
  const { DynamicEvmWalletClient } = await import("@dynamic-labs-wallet/node-evm");
  const client = new DynamicEvmWalletClient({ environmentId });
  await client.authenticateApiToken(apiKey);
  return {
    kind: "dynamic-server-wallet",
    address: saved.walletMetadata.accountAddress as Address,
    async signRender(m) {
      const sig = await client.signTypedData({
        walletMetadata: saved.walletMetadata,
        externalServerKeyShares: saved.externalServerKeyShares,
        // delegatedSignTypedData/signTypedData hash the full {domain, types, primaryType, message}.
        typedData: renderTypedData(m) as never,
      });
      return sig as Hex;
    },
  };
}

function localAgent(): RenderAgent | null {
  const key = loadKey("RENDER_AGENT_KEY_FILE", "RENDER_AGENT_PRIVATE_KEY");
  if (!key) return null;
  const account = privateKeyToAccount(key);
  return {
    kind: "local-key",
    address: account.address,
    signRender: (m) => account.signTypedData(renderTypedData(m)),
  };
}

export async function renderAgent(): Promise<RenderAgent> {
  const a = (await dynamicAgent()) ?? localAgent();
  if (!a) throw new Error("no render agent configured (DYNAMIC_API_KEY + pnpm agent:dynamic, or RENDER_AGENT_KEY_FILE)");
  return a;
}

/** Is this agent registered with the escrow? The UI shows it; payRender reverts otherwise. */
export async function agentRegistered(address: Address): Promise<boolean> {
  return pub().readContract({ address: requireAddress("LicenseEscrow"), abi: LicenseEscrowAbi, functionName: "isRenderAgent", args: [address] });
}
