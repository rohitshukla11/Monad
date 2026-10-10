# Deploying the web app to Vercel

The web app in `web/` deploys to Vercel as a standard Next.js project. The contracts are already on
Monad testnet, and the indexer is optional and hosted separately. This page covers:

- the project settings and storage;
- the environment variables;
- the external dashboards that must know the new domain;
- the limits of running this app on serverless functions.

## 1. Project

1. Import the GitHub repository into Vercel and set **Root Directory** to `web`.
2. Leave the framework as **Next.js**. [`web/vercel.json`](../web/vercel.json) sets the install and build
   commands. They run pnpm 12.5.1, the version in `package.json`, because that version honours
   `allowBuilds` in `pnpm-workspace.yaml`. The C2PA native binding is downloaded by its install script,
   so the script must run.
3. **Node.js version:** 22.x, from `engines` in `package.json`.
4. Keep **Fluid compute** on, which is the default for new projects. The render route allows 300 s, and
   the Didit, capture, attestation, release, drip and verify routes allow 60 s.

[`web/.vercelignore`](../web/.vercelignore) keeps `.env.local`, `.data/` and `.models/` out of
`vercel deploy` uploads.

## 2. Storage

Create a **Blob** store under the project's **Storage** tab, with private access, and connect it. This sets
`BLOB_READ_WRITE_TOKEN`. Then set:

```
STORE_DRIVER=blob
```

With this set, all of the following are kept as private Blob objects instead of local files:

- the ciphertext vault;
- the app records (requests, briefs, consent and Didit records, delegation grants, render records);
- finished renders;
- the RPC history cache.

On Vercel the disk is per instance, so `local` would lose data.

## 3. Environment variables

On Vercel there is no `../.secrets/` folder, so each secret is passed as its **value**. The `*_FILE`
variables from `.env.example` are not needed. Locally nothing changes: when a value is unset, the server
still reads the file.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_DYNAMIC_ENV_ID` | The Dynamic environment ID |
| `NEXT_PUBLIC_RP_ID` | The deployment's domain, e.g. `likeness.vercel.app` (no scheme, no port) |
| `NEXT_PUBLIC_APP_URL` | `https://` plus that domain (Didit's redirect after verification) |
| `NEXT_PUBLIC_MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz` |
| `STORE_DRIVER` | `blob` |
| `ATTESTER_PRIVATE_KEY` | Contents of `.secrets/attester.key` |
| `DRIP_PRIVATE_KEY` | Contents of `.secrets/drip.key` |
| `RENDER_AGENT_PRIVATE_KEY` | Contents of `.secrets/render-agent.key` (this address is registered with LicenseEscrow) |
| `C2PA_CERT_PEM`, `C2PA_KEY_PEM` | Contents of `.secrets/c2pa/signer.pem` and `signer.key` |
| `DIDIT_API_KEY`, `VERIFICATION_LEVEL`, `DIDIT_WORKFLOW_ID_FREE`, `DIDIT_WORKFLOW_ID_FULL`, `DIDIT_WEBHOOK_SECRET` | As in `web/.env.local` |
| `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`, `GEMINI_IMAGE_SIZE`, `GEMINI_FILTER_MODEL` | As in `web/.env.local` |
| `DYNAMIC_API_KEY`, `DYNAMIC_WEBHOOK_SECRET` | Only if Dynamic delegated access or the server wallet is used |
| `DYNAMIC_DELEGATION_PRIVATE_KEY_PEM` | Contents of `.secrets/dynamic-delegation.pem`, if used |
| `DYNAMIC_AGENT_JSON` | Contents of `.secrets/dynamic-agent.json`, if used |
| `ENVIO_GRAPHQL_URL` | Optional: a hosted Envio indexer. Without it, history comes from RPC log scans, cached in Blob |

PEM values can be pasted with real newlines or with `\n` escapes. From a terminal in `web/`, the Vercel CLI
reads a value from standard input, which keeps it out of shell history:

```sh
vercel env add C2PA_CERT_PEM production < ../.secrets/c2pa/signer.pem
vercel env add ATTESTER_PRIVATE_KEY production < ../.secrets/attester.key
```

Leave `DEV_WALLETS` and `DEV_DELEGATION` unset. They are for local testing with seeded keys only.

## 4. External dashboards

- **Dynamic:** add `https://<domain>` to the environment's allowed origins (CORS). If delegated access
  is used, point its webhook at `https://<domain>/api/dynamic/webhook`.
- **Didit:** to use webhooks instead of polling, set the webhook URL to
  `https://<domain>/api/didit/webhook`.
- **Passkeys** are bound to `NEXT_PUBLIC_RP_ID`. A passkey created on `localhost` does not work on the
  deployed domain, so creators onboard again there.

## 5. Limits on serverless (known, accepted for the testnet demo)

Some state is kept in one server process's memory by design, so that it is never written anywhere.
Vercel can run several instances at once and replaces them over time. When a follow-up request reaches
another instance, these break:

| What | Kept in memory | What a user may see on Vercel |
|---|---|---|
| Render service keys and the creator's photo release ([`keyring.ts`](../web/lib/server/keyring.ts)) | The per-licence X25519 key and the release | "the creator has not released their reference photos for this licence yet" on Generate, or "fetch this licence's service key first" when releasing. The creator releases again; it may take more than one try. |
| Matched capture digests ([`captures.ts`](../web/lib/server/captures.ts)) | Between the photo check and the attestation, 30 minutes at most | "no matched reference photos for this wallet; take them again" at **Protect with Face ID and register** |
| Signed-action replay check, per-licence render lock, drip in-flight set | Per instance | Weaker protection than on one server; the contracts still enforce every licence rule |

Fluid compute reuses a warm instance for most requests at demo traffic, so these failures are occasional
rather than constant. They are not fixed here.

**Free-level face matching does not run on Vercel.** The local matcher's AuraFace model is 260 MB. That is
above Vercel's 250 MB function limit, so `.models/` is not deployed. `/status` shows "Local face
matcher" as not configured, and at `VERIFICATION_LEVEL=free` the photo check fails. Creators onboard
locally at the free level, or the deployment uses `full`, which needs Didit credit.

## 6. Not yet verified

These changes were checked locally: typecheck, unit tests, and the dev server reading secrets from files.
They have not yet been deployed to Vercel, and the Blob code path has not run against a real Blob store.
