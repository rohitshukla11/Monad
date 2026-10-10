# Local checks

Everything runs on `http://localhost:3000`. The passkey relying party is `localhost`, and ciphertext
goes to `web/.data/vault`.

## Setup (once)

1. Install Node 22 or later. The repo pins it in `.nvmrc`; with nvm, run `nvm install 22 && nvm use`.
2. In `web/.env.local`, set `NEXT_PUBLIC_DYNAMIC_ENV_ID` to your Dynamic sandbox environment ID. In the
   Dynamic dashboard, that environment needs:
   - email sign-in;
   - embedded wallets;
   - `http://localhost:3000` in its allowed origins.

   Every other value is already filled in.
3. Start the app:

```sh
cd web
pnpm install
pnpm dev          # http://localhost:3000
```

## 1. Email sign-in to an embedded wallet on Monad testnet

1. Open `http://localhost:3000/onboard`.
2. Under **Your wallet**, enter your email and choose **Email me a code**.
3. Enter the 6-digit code and choose **Verify**.
4. Choose **Create my wallet**.

**Expected:** an address appears, the network reads `Monad testnet (10143)`, and the address links to
MonadVision.

## 2. MON drip on a fresh wallet

1. With the new wallet from check 1, choose **Get MON for gas**.

   **Expected:** "Sent 0.5 MON" with a transaction link, and the balance shows `0.5 MON`. The `pnpm dev`
   terminal prints one JSON log line with `"result":"sent"`.
2. Choose **Get MON for gas** again.

   **Expected:** "only new, empty wallets get a drip" and a `"refused-not-new"` log line.

## 3. Cross-browser passkey test (Safari, then Chrome, using one iCloud Keychain passkey)

This needs no sign-in. Run both browsers on the same Mac, signed in to iCloud with Keychain on.

1. **In Safari**, open `http://localhost:3000/onboard`.
   1. In **Your keys**, choose **Create passkey** and approve with Touch ID or your password. Safari
      saves it to iCloud Keychain.
   2. Note the **Key fingerprint**.
   3. Type a note, then choose **Encrypt and store**.

   **Expected:** "Stored. Only ciphertext left this browser."
2. **In Chrome** (version 132 or later), open `http://localhost:3000/onboard`.
   1. Choose **Use my existing passkey**.
   2. In Chrome's passkey dialog, pick the **iCloud Keychain** passkey, not one saved in the Chrome
      profile. Chrome's own profile passkeys have no PRF support.

   **Expected:** the same key fingerprint as in Safari.
3. Choose **Fetch and decrypt**.

   **Expected:** "Decrypted on this device:" followed by your note.

Notes:

- Each passkey stores one note, because the store is write-once. To repeat the test, create a new
  passkey.
- If several Likeness passkeys exist, pick the same one in both browsers.
- Optional: `cat web/.data/vault/*.json` shows only `v`, `iv` and `ct`, all ciphertext.

## 4. Creator onboarding with Didit

Needs `DIDIT_API_KEY`, `VERIFICATION_LEVEL` and both workflow IDs in `web/.env.local`, plus
`NEXT_PUBLIC_DYNAMIC_ENV_ID` for the wallet.

- **`free`** (works at zero Didit balance): workflow `91e2b242-5f83-4e36-a2c7-473b37798f7d`, with
  passive liveness and desktop allowed. Run `pnpm face:models` once for the local photo matcher.
- **`full`** (needs Didit credit): workflow `33cc5ee3-5ce8-43d5-adbe-fc0e31762457`, with `ACTIVE_3D`
  liveness and phone only.

Both workflows run OCR (minimum age 18, decline below), then liveness, then FACE_MATCH.

On `/onboard`:

1. Sign in, create the wallet, get MON for gas, and create the passkey (**Your keys**).
2. In **Verify and register**, choose **Start**. Read the consent, tick the box, and choose **Sign my
   consent**.
3. Choose **Start verification**. Didit opens in a new tab.
   - At `full`, scan its QR code and finish on your phone.
   - At `free`, you can use the computer's camera.

   Either way, you show your ID document and do the liveness check. The onboarding page polls our server,
   which reads Didit's decision.
4. Take the three guided photos. Each is face-matched to your liveness selfie.
5. Set your terms and choose **Encrypt my photos and register**.

**Expected:** "Attested: provider didit, liveness didit:passive" (or `didit:active` at `full`), then a
`register` transaction on MonadVision. The marketplace then shows your creator as **Verified**, with
a **passive liveness** or **active liveness** badge.

### Re-verify at a higher level

Once registered at `free`, set `VERIFICATION_LEVEL=full` (and add Didit credit). Then, on `/dashboard`:

1. In **Verification**, choose **Re-verify at a higher level (full)**.
2. Sign the consent.
3. Complete Didit's session on your phone.
4. Choose **Re-check my photos and upgrade**. Your passkey opens your sealed photos in the browser.

**Expected:** "Upgrade attested: liveness didit:active", then an `updateAttestation` transaction. The
badge changes to **active liveness**, and the profile shows "upgraded to this level on …". Re-verifying
at `free` after that is refused.

## 5. The whole protocol in one command (no credentials needed)

```sh
cd web
pnpm c2pa:testcert   # once
pnpm demo --fork
```

**Expected:** twelve numbered steps and a closing table of transaction hashes, from `register creator
(dev-unverified)` to `refund`. Along the way:

- step 10 prints `Licensed: …` with notes saying it is a TEST RENDER, signed with a test certificate,
  for an unverified test creator;
- step 11 prints `render refused: Licence active (Revoked)` and `Revoked. Licensed when made (…), since
  revoked on …`.

The two rendered files are in `web/.data/demo-fork/demo-output/`. The scripted demo runs only on the
fork; on Monad testnet, run it in the app (section 6).

## 6. The live demo on Monad testnet, in the app

You need:

- a Didit-verified creator (section 4), signed in in one tab;
- the test brand, from `pnpm seed`, funded with Circle USDC on **Monad Testnet**: faucet.circle.com,
  network **Monad Testnet**. The faucet's default network is Arc, which won't work here.

`DEV_WALLETS=1` must be set in `web/.env.local`.

1. **Tab B, brand:** in the header picker, choose **DEV: Test brand**. Go to **Marketplace**, open your
   creator, and request a licence. With manual terms, it goes to the creator.
2. **Tab A, creator:** on **Dashboard**, under **Requests waiting for you**, choose **Approve**.
3. **Tab B:** under **Your requests to this creator**, choose **Issue licence on chain**.
4. **Tab A:** on the licence, choose **Release photos to renderer** (passkey).
5. **Tab B:** on **Dashboard**, deposit USDC. Then, on **Generate**, render with **Confirm payRender in my
   wallet**.
6. Verify a render on `/verify`. Revoke it from tab A, then refund from tab B.

## 7. Verify

Open `/verify` and drop `web/.data/demo-fork/demo-output/*render-0.jpg`.

**Expected:** **Unknown**, because the receipt exists only on the fork. The manifest panel still shows
a valid signature, the test-certificate warning, the claimed licence and the TEST RENDER label. Files
rendered on testnet verify as Licensed, or as Revoked after a revoke.

## 8. Indexer (optional)

```sh
cd indexer
pnpm install
pnpm local            # embedded Postgres + envio start, no Docker
```

Set `ENVIO_PG_URL=postgres://postgres:testing@localhost:5433/envio-dev` in `web/.env.local`.

**Expected:** `/market` says "listed from the Envio indexer", and `/status` shows Envio as configured.
Without `ENVIO_API_TOKEN` the indexer syncs over the public RPC at its 50 requests-per-second limit.
