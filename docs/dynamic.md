# How Likeness uses Dynamic

**Bounty:** Best Use of Dynamic. The suggested bonus combination is agent wallets plus delegated access.

## In one paragraph (for the submission form)

Every person in Likeness signs in with email through Dynamic and gets an embedded wallet on Monad
testnet. Creators are paid into it; brands fund USDC escrow from it. The render service runs a
**Dynamic server wallet as its render agent**, which signs an attestation for each image it produces.
Brands grant that service **delegated access** to their embedded wallet, scoped by a Dynamic policy
rule to one function, `LicenseEscrow.payRender` on chain 10143. Generating an image is then one click
with no wallet prompt. Each render still needs both keys:

- the brand's delegated wallet sends the transaction;
- the agent's signature proves the exact file was produced under that licence.

The escrow contract enforces the price, the render cap and the balance, so neither Dynamic key can
overspend. One flow uses three Dynamic primitives in depth: embedded wallets, an agent wallet, and
delegated access with a policy.

## Status

Everything below is built behind interfaces and switches on when its credential is in `web/.env.local`.
Until then the app says it is off, and nothing is attributed to Dynamic that Dynamic did not do.

| Piece | Code | State |
|---|---|---|
| Email OTP sign-in and WaaS EVM embedded wallet on Monad testnet | [`WalletPanel.tsx`](../web/components/WalletPanel.tsx), [`WalletProvider.tsx`](../web/components/wallet/WalletProvider.tsx) | Built; needs `NEXT_PUBLIC_DYNAMIC_ENV_ID` |
| Monad testnet as a custom network (`transformers.networksData`) | [`providers.tsx`](../web/app/providers.tsx) | Built |
| One-time MON drip to new embedded wallets | [`drip.ts`](../web/lib/server/drip.ts) | Built and funded |
| Brand delegates its embedded wallet to the render service: `delegateWaasKeyShares` with an `initialSignerRules` allow rule | [`Delegation.tsx`](../web/components/dashboard/Delegation.tsx) | Built; needs the delegation credentials below |
| Webhook `wallet.delegation.created` / `.revoked`, HMAC-SHA256 checked (`x-dynamic-signature-256`); share stored still encrypted to our RSA key | [`api/dynamic/webhook`](../web/app/api/dynamic/webhook/route.ts) | Built; needs `DYNAMIC_WEBHOOK_SECRET` and a public URL |
| Server-side delegated signing (`decryptDelegatedWebhookData` per signature, `delegatedSignTransaction`, then `sendRawTransaction`) | [`delegation.ts`](../web/lib/server/delegation.ts) | Built; needs `DYNAMIC_API_KEY`, `DYNAMIC_DELEGATION_PRIVATE_KEY_FILE` |
| Render agent as a Dynamic server wallet (`DynamicEvmWalletClient.createWalletAccount`, `signTypedData`) | [`agent.ts`](../web/lib/server/agent.ts), `pnpm agent:dynamic` | Built; needs `DYNAMIC_API_KEY`. A local key signs until then |
| Revocation: `revokeWaasDelegation` in the browser, and the grant closed on our side | [`Delegation.tsx`](../web/components/dashboard/Delegation.tsx), [`api/delegation`](../web/app/api/delegation/route.ts) | Built |

**Before credentials** the same interfaces run a labelled stand-in. The seeded test brand can turn on
**DEV delegation**: a local key file, `DEV_DELEGATION=1`, shown as "DEV delegation (local key, not
Dynamic)". It passes through the same policy guard, so the guard is exercised by the fork tests and the
demo. Any brand can also skip delegation: the server signs the render authorisation and holds the
file, and the brand's own wallet sends `payRender`.

## The policy, layer by layer

The brand chooses a **total cap** in USDC and signs a statement naming the escrow, `payRender`, chain
10143 and the cap. Then:

1. **Dynamic signer rule** (installed with `delegateWaasKeyShares`): `chainIds: [10143]` and an
   `addresses` allowlist. The allowlist covers every address a `payRender` touches: the four protocol
   contracts, USDC and USDC's proxy implementation, because Dynamic evaluates every touched address.
   These are the fields Dynamic's signer layer enforces. The SDK's own types say `functionName`,
   `contractAbi` and `valueLimit.totalLimit` are not evaluated on signer layers
   (`@dynamic-labs-sdk/client` 1.38.0, `policies/policies.types.d.ts`). We do not set them and imply
   they protect anything.
2. **Our guard** ([`checkPolicy`](../web/lib/server/delegation.ts)), before any delegated signature,
   refuses a transaction unless all of these hold:
   - the destination is our escrow;
   - the chain is 10143;
   - the value is 0;
   - the calldata decodes as `payRender`;
   - the licence belongs to this brand;
   - the price fits under the remaining cap.

   Spends are serialised per brand, and the cap is charged only once the transaction succeeds. The
   fork test checks each refusal.
3. **The contract:** `payRender` requires the licensee as sender and a render agent's signature over
   the exact file. It pays at most the licence price, only to the creator, the treasury and refunds.

## Credentials to add

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_DYNAMIC_ENV_ID` | Dashboard → Developers → SDK & API keys (sandbox environment); add `http://localhost:3000` to allowed origins |
| `DYNAMIC_API_KEY` | Dashboard → Developers → API tokens (environment API token) |
| `DYNAMIC_WEBHOOK_SECRET` | The webhook Dynamic creates when the Delegated Access endpoint is registered (Embedded Wallets → Delegated Access); the endpoint is `https://<public host>/api/dynamic/webhook` (a tunnel such as ngrok locally) |
| `DYNAMIC_DELEGATION_PRIVATE_KEY_FILE` | The RSA private key (PEM) whose public half is registered for delegated access; keep it in `../.secrets/` |

## The honest limits

- **Delegated access is sandbox-only without a Dynamic Enterprise plan**
  ([delegated access](https://www.dynamic.xyz/docs/embedded-wallets/mpc/delegated-access/overview.md)).
  The demo runs in the Dynamic sandbox.
- **Wallet and signer policy layers are in early access** at Dynamic. The signer rule is installed with
  the delegation, but we rely on it only for chain ID and addresses (see the layers above).
- **Monad is not named in Dynamic's chain list**; it is configured as a custom EVM network. Whether
  Dynamic's policy simulation covers chain 10143 is untested until the sandbox credentials arrive.
  Layers 2 and 3 hold either way.
- **The real enforcement is on chain.** `LicenseEscrow.payRender` requires the licensee as `msg.sender`
  *and* a registered render agent's EIP-712 signature. It reverts on a revoked, expired or used-up
  licence, or on a short balance.
- **The webhook needs a public HTTPS URL.** Locally that means a tunnel.
- **Fireblocks Flow** needs Dynamic's team to unlock it, so it is not used.

## APIs used (verified against the published packages)

- `@dynamic-labs-sdk/client` 1.38.0: `createDynamicClient` (`environmentId`, `transformers.networksData`).
  From `@dynamic-labs-sdk/client/waas`: `createWaasWalletAccounts`, `delegateWaasKeyShares`
  (`walletAccount`, `initialSignerRules`), `buildAllowPolicyRule`.
- `@dynamic-labs-sdk/evm` 1.38.0: `addWaasEvmExtension` (`/waas`) and
  `createWalletClientForWalletAccount` (`/viem`).
- `@dynamic-labs-sdk/react-hooks` 1.38.0: `DynamicProvider`, `useSendEmailOTP`, `useVerifyOTP`, `useUser`,
  `useGetWalletAccounts`, `useCreateWaasWalletAccounts`, `useDelegateWaasKeyShares`, `useLogout`.
- `@dynamic-labs-wallet/node-evm` 1.1.28: `createDelegatedEvmWalletClient`, `delegatedSignTransaction`,
  `DynamicEvmWalletClient` (`authenticateApiToken`, `createWalletAccount`, `signTypedData`).
- `@dynamic-labs-wallet/node` 1.1.28: `decryptDelegatedWebhookData`, `ThresholdSignatureScheme`.
