"use client";

/**
 * Creator onboarding in three steps:
 *   1. Sign in: email, and the embedded wallet is created automatically; gas arrives in the background.
 *   2. Verify it's you: the consent (signed) folded into Didit's first screen, then Didit's ID, liveness
 *      and face match, read from Didit by the server.
 *   3. Capture and protect: three guided photos, each matched to the liveness selfie, then one button
 *      that creates the passkey, seals the photos under it, gets the attestation and registers.
 * Wallet, balance, key fingerprint and transaction links stay in a collapsed Details panel.
 */
import {
  useCreateWaasWalletAccounts,
  useGetWalletAccounts,
  useLogout,
  useSendEmailOTP,
  useUser,
  useVerifyOTP,
} from "@dynamic-labs-sdk/react-hooks";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPublicClient, formatEther, http, type Hex } from "viem";
import { CreatorRegistryAbi } from "@/lib/abi/CreatorRegistry";
import { actionMessage } from "@/lib/auth";
import { explorer, monadTestnet } from "@/lib/chain";
import { api, reason, write } from "@/lib/client/tx";
import { CONSENT_POINTS, CONSENT_VERSION, DIDIT_LINKS, consentTextHash } from "@/lib/consent";
import { referenceSetHash, sealReferenceSet, sha256Hex } from "@/lib/crypto/envelope";
import { createPasskey, namespaceKey } from "@/lib/crypto/passkey";
import { vaultId, vaultPut } from "@/lib/crypto/vault";
import { deployment } from "@/lib/deployment";
import type { Terms } from "@/lib/licensing";
import { useDynamicState } from "@/app/providers";
import { Details, pillClass } from "@/components/ds";
import { IconCheck } from "@/components/ds/icons";
import { KeysPanel } from "@/components/KeysPanel";
import { STARTER_TERMS, TermsEditor } from "@/components/TermsEditor";
import { Note, Tx, inputClass } from "@/components/ui";
import { useWallet, type ActiveWallet } from "@/components/wallet/WalletProvider";
import { CaptureStep } from "./CaptureStep";
import { DiditStep } from "./DiditStep";

const pub = createPublicClient({ chain: monadTestnet, transport: http() });

type Facts = { balance?: string; dripTx?: string; fingerprint?: string; registerTx?: string; registerMs?: number };

export function OnboardFlow() {
  const { wallet } = useWallet();
  const dynamic = useDynamicState();
  const [facts, setFacts] = useState<Facts>({});
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [consented, setConsented] = useState(false);
  const [verified, setVerified] = useState(false);
  const note = useCallback((f: Facts) => setFacts((x) => ({ ...x, ...f })), []);

  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/creators/${wallet.address}`, { cache: "no-store" }).then((r) => setRegistered(r.ok));
    api<{ consented: boolean }>(`/api/consent?address=${wallet.address}`).then((r) => setConsented(r.consented)).catch(() => {});
    api<{ state: string }>(`/api/didit/status?address=${wallet.address}`).then((r) => setVerified(r.state === "approved")).catch(() => {});
    pub.getBalance({ address: wallet.address }).then((b) => note({ balance: formatEther(b) })).catch(() => {});
  }, [wallet, note]);

  // A new, empty wallet gets MON for gas in the background, once; the server refuses any other wallet.
  const dripped = useRef<string | null>(null);
  useEffect(() => {
    if (!wallet || dripped.current === wallet.address) return;
    dripped.current = wallet.address;
    const address = wallet.address;
    (async () => {
      if ((await pub.getBalance({ address })) > 0n) return;
      const r = await fetch("/api/drip", { method: "POST", body: JSON.stringify({ address }) });
      const j = (await r.json()) as { hash?: Hex };
      if (!j.hash) return;
      note({ dripTx: j.hash });
      await pub.waitForTransactionReceipt({ hash: j.hash });
      note({ balance: formatEther(await pub.getBalance({ address })) });
    })().catch(() => {});
  }, [wallet, note]);

  const step = !wallet ? 1 : registered ? 4 : !verified ? 2 : 3;

  return (
    <div className="flex flex-col gap-5">
      <ol aria-label="Steps" className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
        {["Sign in", "Verify it's you", "Capture and protect"].map((t, i) => {
          const n = i + 1;
          const done = step > n;
          const now = step === n;
          return (
            <li
              key={t}
              aria-current={now ? "step" : undefined}
              className={`flex items-center gap-3 rounded-[20px] px-5 py-4 ${now ? "bg-ink text-white" : done ? "bg-white text-ink" : "bg-white/60 text-grey"}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold ${now ? "bg-lime text-ink" : done ? "bg-ok-bg text-ok" : "bg-[#E3E6EC] text-grey"}`}>
                {done ? <IconCheck size={16} stroke="#3B6E25" /> : n}
              </span>
              <span className="text-[15px] font-semibold">{t}</span>
              {done && <span className="sr-only">(done)</span>}
            </li>
          );
        })}
      </ol>

      <section className="rounded-[26px] bg-white p-6 sm:p-8">
        {step === 1 &&
          (dynamic === "ready" ? (
            <SignIn />
          ) : (
            <Note>{dynamic === "off" ? "Sign-in is off on this server (NEXT_PUBLIC_DYNAMIC_ENV_ID)." : "Loading sign-in…"}</Note>
          ))}
        {step === 2 && wallet && <VerifyStep wallet={wallet} consented={consented} onConsent={() => setConsented(true)} onVerified={() => setVerified(true)} />}
        {step === 3 && wallet && !deployment.CreatorRegistry && <Note>The contracts are not deployed yet, so registration is off.</Note>}
        {step === 3 && wallet && deployment.CreatorRegistry && <ProtectStep wallet={wallet} onDone={(f) => (note(f), setRegistered(true))} onFingerprint={(fingerprint) => note({ fingerprint })} />}
        {step === 4 && (
          <div className="flex flex-col items-start gap-4">
            <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">You&apos;re a registered, verified creator</h2>
            <p className="m-0 text-[16px] text-grey">Brands can now find you in the marketplace and request a licence. You approve each one from your dashboard.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard" className={pillClass("ink")}>
                Open my dashboard
              </Link>
              {wallet && (
                <Link href={`/market/${wallet.address}`} className={pillClass("outline")}>
                  See my profile
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      <Details summary="Details">
        <dl className="m-0 grid grid-cols-[9rem_1fr] gap-y-2">
          <dt className="text-grey">Wallet</dt>
          <dd className="m-0 break-all font-mono text-[13px]">
            {wallet ? (
              <a href={explorer.address(wallet.address)} target="_blank" rel="noreferrer">
                {wallet.address}
              </a>
            ) : (
              "not signed in"
            )}
          </dd>
          <dt className="text-grey">Network</dt>
          <dd className="m-0">Monad testnet (10143)</dd>
          <dt className="text-grey">Balance</dt>
          <dd className="tnum m-0">{facts.balance ? `${facts.balance} MON` : "—"}</dd>
          <dt className="text-grey">Gas drip</dt>
          <dd className="m-0">{facts.dripTx ? <Tx hash={facts.dripTx} /> : "—"}</dd>
          <dt className="text-grey">Key fingerprint</dt>
          <dd className="tnum m-0 font-mono text-[13px]">{facts.fingerprint ?? "—"}</dd>
          <dt className="text-grey">Registration</dt>
          <dd className="m-0">{facts.registerTx ? <Tx hash={facts.registerTx} ms={facts.registerMs} /> : "—"}</dd>
        </dl>
        {dynamic === "ready" && <SignOut />}
        <KeysPanel />
      </Details>
    </div>
  );
}

// ---------------------------------------------------------------- 1. sign in

function SignIn() {
  const user = useUser();
  const accounts = useGetWalletAccounts();
  const send = useSendEmailOTP();
  const verify = useVerifyOTP();
  const createWallet = useCreateWaasWalletAccounts();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const creating = useRef(false);
  const evm = accounts.data?.find((a) => a.chain === "EVM");
  const otp = send.data;

  // Signed in without a wallet yet: create it, no extra click.
  useEffect(() => {
    if (user.data && accounts.isFetched && !evm && !creating.current) {
      creating.current = true;
      createWallet.mutate({ chains: ["EVM"] }, { onSuccess: () => accounts.refetch() });
    }
  }, [user.data, accounts, evm, createWallet]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">Sign in with your email</h2>
      <p className="m-0 max-w-2xl text-[16px] text-grey">We create your wallet on Monad as you sign in, and send it a little MON for gas. No seed phrase, no extension.</p>
      {!user.data && !otp && (
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate({ email });
          }}
        >
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={`${inputClass} max-w-sm`} />
          <button type="submit" disabled={send.isPending} className={pillClass("ink")}>
            Email me a code
          </button>
        </form>
      )}
      {!user.data && otp && (
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            verify.mutate({ otpVerification: otp, verificationToken: code });
          }}
        >
          <label htmlFor="code" className="sr-only">
            Six-digit code
          </label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" className={`${inputClass} tnum max-w-[12rem]`} />
          <button type="submit" disabled={verify.isPending} className={pillClass("ink")}>
            Verify
          </button>
        </form>
      )}
      {user.data && !evm && <p role="status" className="m-0 text-[16px]">Creating your wallet…</p>}
      {(send.error || verify.error || createWallet.error) && <Note tone="down">{(send.error ?? verify.error ?? createWallet.error)?.message}</Note>}
    </div>
  );
}

function SignOut() {
  const logout = useLogout();
  return (
    <button type="button" onClick={() => logout.mutate()} className={pillClass("outline", "self-start")}>
      Sign out
    </button>
  );
}

// ---------------------------------------------------------------- 2. verify it's you

function VerifyStep({ wallet, consented, onConsent, onVerified }: { wallet: ActiveWallet; consented: boolean; onConsent: () => void; onVerified: () => void }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agreeAndStart() {
    setBusy(true);
    setError(null);
    // Opened in the click itself, so the browser does not block it as a pop-up.
    const tab = window.open("", "_blank");
    try {
      const message = actionMessage("consent to identity verification and likeness licensing", {
        wallet: wallet.address.toLowerCase(),
        version: CONSENT_VERSION,
        "text sha256": await consentTextHash(),
      });
      const signature = await wallet.client.signMessage({ account: wallet.client.account, message });
      await api("/api/consent", { method: "POST", body: JSON.stringify({ address: wallet.address, auth: { message, signature } }) });
      const s = await api<{ url?: string }>("/api/didit/session", { method: "POST", body: JSON.stringify({ address: wallet.address }) });
      if (tab && s.url) {
        tab.opener = null;
        tab.location.href = s.url;
      } else tab?.close();
      onConsent();
    } catch (e) {
      tab?.close();
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  }

  if (consented) return <DiditStep address={wallet.address} onDone={onVerified} />;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">Verify it&apos;s you</h2>
      <p className="m-0 max-w-3xl text-[16px] text-grey">
        Didit checks your ID (we only learn that you are 18 or over), takes a liveness selfie and matches it to your ID. First, what you are agreeing to:
      </p>
      <ol className="m-0 max-w-3xl list-decimal space-y-2 pl-5 text-[15px] text-[#3E4148]">
        {CONSENT_POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <p className="m-0 text-[14px] text-grey">
        Didit&apos;s{" "}
        <a href={DIDIT_LINKS.privacy} target="_blank" rel="noreferrer" className="text-wait underline">
          verification privacy notice
        </a>{" "}
        and{" "}
        <a href={DIDIT_LINKS.terms} target="_blank" rel="noreferrer" className="text-wait underline">
          identity verification terms
        </a>
        . Consent version {CONSENT_VERSION}.
      </p>
      <label className="flex min-h-11 items-start gap-3 text-[16px]">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 h-5 w-5 accent-[#121316]" />
        <span>I agree, including to Didit processing my identity document and my face (biometric data) for this verification.</span>
      </label>
      <button type="button" disabled={!checked || busy} onClick={agreeAndStart} className={pillClass("ink", "self-start")}>
        {busy ? "Signing…" : "Agree and start verification"}
      </button>
      <p className="m-0 text-[13px] text-grey">Your wallet signs this consent; Didit opens in a new tab.</p>
      {error && <Note tone="down">{error}</Note>}
    </div>
  );
}

// ---------------------------------------------------------------- 3. capture and protect

function ProtectStep({ wallet, onDone, onFingerprint }: { wallet: ActiveWallet; onDone: (f: Facts) => void; onFingerprint: (fp: string) => void }) {
  const [captures, setCaptures] = useState<Uint8Array[]>([]);
  const [matched, setMatched] = useState<number[] | null>(null);
  const [terms, setTerms] = useState<Terms>(STARTER_TERMS);
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const say = (l: string) => setLog((x) => [...x, l]);

  async function check(shots: Uint8Array[]) {
    setError(null);
    setBusy(true);
    try {
      const photos = (await Promise.all(shots.map(sha256Hex))).join(",");
      const message = actionMessage("verify reference photos", { wallet: wallet.address.toLowerCase(), photos });
      const auth = { message, signature: await wallet.client.signMessage({ account: wallet.client.account, message }) };
      const b64 = shots.map((s) => btoa(Array.from(s, (c) => String.fromCharCode(c)).join("")));
      const r = await api<{ scores: number[] }>("/api/captures/verify", { method: "POST", body: JSON.stringify({ address: wallet.address, captures: b64, auth }) });
      setCaptures(shots);
      setMatched(r.scores);
    } catch (e) {
      shots.forEach((s) => s.fill(0));
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  }

  async function protect() {
    setBusy(true);
    setError(null);
    try {
      say("Creating your passkey (Face ID or Touch ID)…");
      const key = existing
        ? await namespaceKey({ kind: "reference" })
        : await createPasskey({ name: `likeness-${wallet.address.slice(2, 8)}`, displayName: "Likeness creator" }, { kind: "reference" });
      onFingerprint(key.fingerprint);
      const set = await sealReferenceSet(key.kek, wallet.address, captures);
      captures.forEach((c) => c.fill(0));
      setCaptures([]);
      await vaultPut(vaultId(key.credentialId, `reference-set:${await referenceSetHash(set)}`), set);
      say("Photos encrypted in this browser; only ciphertext was stored.");
      const a = await api<{ attestation: Record<string, unknown> & { verifiedAt: string }; deadline: string; signature: Hex; liveness: string }>("/api/attest", {
        method: "POST",
        body: JSON.stringify({ address: wallet.address, referenceSet: set }),
      });
      say(`Attested by the platform (${a.liveness}). Registering on Monad…`);
      const r = await write(wallet, {
        address: deployment.CreatorRegistry!,
        abi: CreatorRegistryAbi,
        functionName: "register",
        args: [wallet.address, { ...a.attestation, verifiedAt: BigInt(a.attestation.verifiedAt) } as never, BigInt(a.deadline), a.signature, terms],
      });
      onDone({ registerTx: r.hash, registerMs: r.ms });
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  }

  if (!matched)
    return (
      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">Capture and protect</h2>
        <p className="m-0 max-w-3xl text-[16px] text-grey">Three quick photos. Each is matched to your liveness selfie, then encrypted in this browser before anything is stored.</p>
        <CaptureStep onDone={check} />
        {busy && <p role="status" className="m-0 text-[15px]">Matching your photos to your selfie…</p>}
        {error && <Note tone="down">{error}</Note>}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">Protect and register</h2>
      <p className="m-0 flex items-center gap-2 text-[16px] text-ok">
        <IconCheck size={18} /> All three photos match your selfie ({matched.map((x) => x.toFixed(0)).join(" / ")}).
      </p>
      <p className="m-0 max-w-3xl text-[16px] text-grey">
        One step: your passkey (Face ID or Touch ID) creates the key your photos are encrypted with, then you are attested and registered on Monad with the terms below.
        You can change your terms any time.
      </p>
      <details className="rounded-2xl border border-field p-4 [&_summary::-webkit-details-marker]:hidden">
        <summary className="min-h-11 cursor-pointer list-none font-semibold">Adjust your terms (optional)</summary>
        <div className="mt-3">
          <TermsEditor initial={terms} submitLabel="Use these terms" onSubmit={setTerms} />
        </div>
      </details>
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" checked={existing} onChange={(e) => setExisting(e.target.checked)} className="h-5 w-5 accent-[#121316]" />
        I already have a Likeness passkey on this device
      </label>
      <button type="button" disabled={busy} onClick={protect} className={pillClass("lime", "self-start")}>
        {busy ? "Working…" : "Protect with Face ID and register"}
      </button>
      {log.length > 0 && (
        <ol role="status" className="m-0 space-y-1 font-mono text-[13px] text-grey">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      )}
      {error && <Note tone="down">{error}</Note>}
    </div>
  );
}
