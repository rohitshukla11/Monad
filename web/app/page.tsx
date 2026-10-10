import Link from "next/link";
import { explorer } from "@/lib/chain";
import { deployment } from "@/lib/deployment";

const contracts = [
  ["CreatorRegistry", "Platform-signed attestation (liveness + 18+ ID check), the creator's terms, payout and revocation epoch. Hashes only, no biometrics."],
  ["LicenseRegistry", "Non-transferable, expiring licences (ERC-721, locked per ERC-5192). Issued against the creator's EIP-712 approval or inside their auto-approve terms."],
  ["LicenseEscrow", "USDC per licence. Each render pays the creator and anchors a receipt in one transaction; the rest is refundable."],
  ["ReceiptAnchor", "One receipt per delivered file, keyed by its sha256. Anyone can look a file up."],
] as const;

const flow = [
  ["Creator", "Proves they are a live adult, seals reference photos under a passkey-derived key, publishes terms."],
  ["Brand", "Requests a licence (auto-approved or signed by the creator) and funds its escrow in USDC."],
  ["Render", "The creator's key is released to that licence only. Each output carries a C2PA manifest and is paid for on chain."],
  ["Anyone", "Checks a file: Licensed, Expired, Revoked or Unknown."],
  ["Creator", "Revokes in one click. New renders stop at the next block; unused escrow goes back."],
] as const;

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="max-w-3xl pt-8">
        <p className="text-xs uppercase tracking-[0.2em] text-dim">A likeness-licensing protocol on Monad</p>
        <h1 className="mt-4 font-display text-5xl font-semibold leading-tight tracking-tight">
          Licence your face to AI, on your terms, and pull it back any time.
        </h1>
        <p className="mt-6 text-lg text-muted">
          Likeness is an open protocol: four contracts that record who consented to what, pay the person per render, and let
          anyone check whether an image was licensed. This app is its reference client. Any other app, model provider or
          verifier can build on the same contracts.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/onboard" className="rounded-full bg-text px-6 py-3 text-sm font-semibold text-ground">
            I&apos;m a creator
          </Link>
          <Link href="/market" className="rounded-full border border-line px-6 py-3 text-sm font-semibold">
            I&apos;m a brand
          </Link>
          <Link href="/verify" className="rounded-full border border-line px-6 py-3 text-sm font-semibold">
            Verify an image
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-semibold">The protocol</h2>
        <div className="grid grid-cols-2 gap-4">
          {contracts.map(([name, body]) => (
            <div key={name} className="rounded-card border border-line-soft bg-panel p-6">
              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-sm font-semibold">{name}</h3>
                {deployment[name] && (
                  <a className="tnum font-mono text-xs text-dim hover:text-blue" href={explorer.address(deployment[name]!)} target="_blank" rel="noreferrer">
                    {deployment[name]!.slice(0, 8)}…{deployment[name]!.slice(-4)}
                  </a>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted">
          Banned on chain, for every licence: political, adult, anything involving minors, impersonation and deception. No terms,
          signature or role can licence them.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-semibold">How a licence runs</h2>
        <ol className="grid grid-cols-5 gap-4">
          {flow.map(([who, body], i) => (
            <li key={i} className="rounded-card border border-line-soft bg-panel p-6">
              <span className="tnum font-mono text-xs text-dim">0{i + 1}</span>
              <h3 className="mt-3 font-display text-sm font-semibold">{who}</h3>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid grid-cols-3 gap-4 text-sm">
        <div className="rounded-card border border-line-soft p-6">
          <h3 className="font-display font-semibold">One transaction per render</h3>
          <p className="mt-2 text-muted">
            <span className="font-mono">payRender</span> checks the licence, pays the creator less a fixed fee, and anchors the
            receipt. It needs the brand&apos;s wallet and the render agent&apos;s signature; neither can spend alone.
          </p>
        </div>
        <div className="rounded-card border border-line-soft p-6">
          <h3 className="font-display font-semibold">No biometrics on chain</h3>
          <p className="mt-2 text-muted">
            Photos are encrypted in the creator&apos;s browser. The chain holds a hash of the ciphertext; the render service gets a
            key for one licence, in memory, dropped on revoke.
          </p>
        </div>
        <div className="rounded-card border border-line-soft p-6">
          <h3 className="font-display font-semibold">Honest about what runs</h3>
          <p className="mt-2 text-muted">
            Anything not configured says so. See <Link className="text-blue" href="/status">status</Link> for what this server
            runs right now.
          </p>
        </div>
      </section>
    </div>
  );
}
