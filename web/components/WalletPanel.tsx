"use client";

/**
 * Sign-in and embedded wallet through Dynamic (JS SDK 1.38.0): email OTP, then a WaaS EVM wallet,
 * then a one-time MON drip for gas. The passkey in KeysPanel is not this wallet: Mera keys only
 * encrypt and derive, Dynamic holds the account.
 */
import {
  useCreateWaasWalletAccounts,
  useGetWalletAccounts,
  useLogout,
  useSendEmailOTP,
  useUser,
  useVerifyOTP,
} from "@dynamic-labs-sdk/react-hooks";
import { useState } from "react";
import { createPublicClient, formatEther, http } from "viem";
import { explorer, monadTestnet } from "@/lib/chain";
import { useDynamicState } from "@/app/providers";

const pub = createPublicClient({ chain: monadTestnet, transport: http() });

export function WalletPanel() {
  const state = useDynamicState();
  if (state === "ready") return <Wallet />;
  return (
    <section className="rounded-card border border-line bg-panel p-8">
      <h2 className="font-display text-xl font-semibold">Your wallet</h2>
      <p className="mt-2 text-sm text-warn">
        {state === "off" ? "Wallets are off: NEXT_PUBLIC_DYNAMIC_ENV_ID is not set." : "Loading…"}
      </p>
    </section>
  );
}

function Wallet() {
  const user = useUser();
  const accounts = useGetWalletAccounts();
  const send = useSendEmailOTP();
  const verify = useVerifyOTP();
  const createWallet = useCreateWaasWalletAccounts();
  const logout = useLogout();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const evm = accounts.data?.find((a) => a.chain === "EVM");
  const otp = send.data;

  async function refreshBalance(address: string) {
    setBalance(formatEther(await pub.getBalance({ address: address as `0x${string}` })));
  }

  async function requestGas(address: string) {
    setMessage("Requesting MON for gas…");
    const r = await fetch("/api/drip", { method: "POST", body: JSON.stringify({ address }) });
    const j = await r.json();
    if (!r.ok) return setMessage(j.error ?? "drip failed");
    setMessage(`Sent ${formatEther(BigInt(j.amount))} MON.`);
    await pub.waitForTransactionReceipt({ hash: j.hash });
    await refreshBalance(address);
    setMessage(`Sent ${formatEther(BigInt(j.amount))} MON: ${explorer.tx(j.hash)}`);
  }

  return (
    <section className="rounded-card border border-line bg-panel p-8">
      <h2 className="font-display text-xl font-semibold">Your wallet</h2>

      {!user.data && !otp && (
        <form
          className="mt-6 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate({ email });
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-80 rounded-full border border-line bg-surface px-4 py-2 text-sm"
          />
          <button disabled={send.isPending} className="rounded-full bg-text px-5 py-2 text-sm font-semibold text-ground disabled:opacity-50">
            Email me a code
          </button>
        </form>
      )}

      {!user.data && otp && (
        <form
          className="mt-6 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            verify.mutate({ otpVerification: otp, verificationToken: code });
          }}
        >
          <input
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            className="w-48 rounded-full border border-line bg-surface px-4 py-2 text-sm tnum"
          />
          <button disabled={verify.isPending} className="rounded-full bg-text px-5 py-2 text-sm font-semibold text-ground disabled:opacity-50">
            Verify
          </button>
        </form>
      )}

      {user.data && !evm && (
        <button
          disabled={createWallet.isPending}
          onClick={() => createWallet.mutate({ chains: ["EVM"] }, { onSuccess: () => accounts.refetch() })}
          className="mt-6 rounded-full bg-text px-5 py-2.5 text-sm font-semibold text-ground disabled:opacity-50"
        >
          {createWallet.isPending ? "Creating wallet…" : "Create my wallet"}
        </button>
      )}

      {user.data && evm && (
        <div className="mt-6 space-y-4 text-sm">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2">
            <dt className="text-dim">Address</dt>
            <dd className="font-mono">
              <a className="hover:text-blue" href={explorer.address(evm.address)} target="_blank" rel="noreferrer">
                {evm.address}
              </a>
            </dd>
            <dt className="text-dim">Network</dt>
            <dd>Monad testnet (10143)</dd>
            <dt className="text-dim">Balance</dt>
            <dd className="tnum">{balance === null ? "—" : `${balance} MON`}</dd>
          </dl>
          <div className="flex gap-3">
            <button onClick={() => refreshBalance(evm.address)} className="rounded-full border border-line px-4 py-2">
              Refresh balance
            </button>
            <button onClick={() => requestGas(evm.address)} className="rounded-full border border-line px-4 py-2">
              Get MON for gas
            </button>
            <button onClick={() => logout.mutate()} className="rounded-full px-4 py-2 text-dim hover:text-text">
              Sign out
            </button>
          </div>
        </div>
      )}

      {(send.error || verify.error || createWallet.error) && (
        <p className="mt-4 text-sm text-down">{(send.error ?? verify.error ?? createWallet.error)?.message}</p>
      )}
      {message && <p className="mt-4 break-all text-sm text-warn">{message}</p>}
    </section>
  );
}
