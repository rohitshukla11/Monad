"use client";

/**
 * Anyone can check a file: drop it here (it is hashed and its C2PA manifest read on the server, and
 * not stored), or paste its sha256. Verdicts: Licensed, Expired, Revoked, Unknown.
 */
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Addr, Badge, Button, Card, fmtDate, H2, Note, TrustBadge, Tx, inputClass } from "@/components/ui";
import type { Trust } from "@/lib/licensing";

type V = {
  verdict: "Licensed" | "Expired" | "Revoked" | "Unknown";
  headline: string;
  assetHash: string;
  receipt: { licenceId: string; renderIndex: number; renderedAt: number; tx?: string } | null;
  manifest:
    | { present: false; error?: string }
    | {
        present: true;
        licence: { licenceId: string; renderIndex: number; renderer: { provider: string; model: string; test: boolean }; createdAt: string } | null;
        signer: { issuer?: string; commonName?: string };
        signatureValid: boolean;
        trustedSigner: boolean;
      }
    | null;
  manifestMatches: boolean | null;
  licence: { id: string; status: string; use: string; regions: string; start: number; end: number; renders: string; price: string; creator: string; licensee: string } | null;
  creator: { address: string; trust: Trust; verifiedAt: number; upgradedAt?: number } | null;
  revoked: { at: number; tx: string; how: string } | null;
  notes: string[];
};

const tone = { Licensed: "up", Expired: "warn", Revoked: "down", Unknown: "dim" } as const;

export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const params = useSearchParams();
  const [hash, setHash] = useState(params.get("hash") ?? "");
  const [result, setResult] = useState<V | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const run = useCallback(async (f: () => Promise<Response>) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await f();
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setResult(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const byHash = useCallback((h: string) => run(() => fetch(`/api/verify?hash=${h.trim()}`, { cache: "no-store" })), [run]);
  useEffect(() => {
    const h = params.get("hash");
    if (h) void byHash(h);
  }, [params, byHash]);

  function onFile(file: File | undefined) {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    const form = new FormData();
    form.append("file", file);
    void run(() => fetch("/api/verify", { method: "POST", body: form }));
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Verify an image</h1>
      <Card className="space-y-5">
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files[0]);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line px-6 py-10 text-center hover:border-muted"
        >
          <span className="font-display text-lg">Drop an image, or choose one</span>
          <span className="text-xs text-dim">JPEG, PNG or WebP. Read in memory for its hash and C2PA manifest; not stored.</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <div className="flex items-center gap-3">
          <input className={`${inputClass} font-mono`} placeholder="…or paste the file's sha256 (0x…)" value={hash} onChange={(e) => setHash(e.target.value)} />
          <Button kind="secondary" disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())} onClick={() => byHash(hash)}>
            Look up
          </Button>
        </div>
        {busy && <Note tone="dim">Checking…</Note>}
        {error && <Note tone="down">{error}</Note>}
      </Card>

      {result && (
        <Card className="space-y-6">
          <div className="flex items-start gap-6">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="The file being verified" className="w-48 rounded-card" />
            )}
            <div className="space-y-3">
              <Badge tone={tone[result.verdict]}>{result.verdict}</Badge>
              <p className="max-w-2xl font-display text-xl leading-snug">{result.headline}</p>
              <p className="break-all font-mono text-xs text-dim">sha256 {result.assetHash}</p>
            </div>
          </div>

          {result.licence && (
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <H2>Licence #{result.licence.id}</H2>
                <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5">
                  <dt className="text-dim">Status now</dt>
                  <dd>{result.licence.status}</dd>
                  <dt className="text-dim">Licensed use</dt>
                  <dd>{result.licence.use}</dd>
                  <dt className="text-dim">Regions</dt>
                  <dd>{result.licence.regions}</dd>
                  <dt className="text-dim">Valid</dt>
                  <dd>
                    {fmtDate(result.licence.start)} → {fmtDate(result.licence.end)}
                  </dd>
                  <dt className="text-dim">Renders</dt>
                  <dd>{result.licence.renders}</dd>
                  <dt className="text-dim">Price</dt>
                  <dd>{result.licence.price}</dd>
                  <dt className="text-dim">Licensee</dt>
                  <dd>
                    <Addr a={result.licence.licensee} />
                  </dd>
                  {result.revoked && (
                    <>
                      <dt className="text-dim">Revoked</dt>
                      <dd>
                        {fmtDate(result.revoked.at)} · <Tx hash={result.revoked.tx} />
                      </dd>
                    </>
                  )}
                </dl>
              </div>
              <div className="space-y-2">
                <H2>Creator and receipt</H2>
                <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5">
                  <dt className="text-dim">Creator</dt>
                  <dd className="flex items-center gap-2">
                    <Addr a={result.licence.creator} href={`/market/${result.licence.creator}`} />
                    {result.creator && <TrustBadge trust={result.creator.trust} />}
                  </dd>
                  {result.creator && (
                    <>
                      <dt className="text-dim">Verified</dt>
                      <dd>
                        {fmtDate(result.creator.verifiedAt)}
                        {result.creator.upgradedAt ? ` · upgraded ${fmtDate(result.creator.upgradedAt)}` : ""}
                      </dd>
                    </>
                  )}
                  <dt className="text-dim">Made</dt>
                  <dd>{result.receipt && fmtDate(result.receipt.renderedAt)}</dd>
                  <dt className="text-dim">Render</dt>
                  <dd>{result.receipt && `#${result.receipt.renderIndex} under this licence`}</dd>
                  <dt className="text-dim">Paid in</dt>
                  <dd>{result.receipt?.tx ? <Tx hash={result.receipt.tx} /> : "receipt found on chain"}</dd>
                </dl>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <H2>C2PA manifest</H2>
            {!result.manifest ? (
              <Note tone="dim">Hash lookup only: no file, so no manifest was read.</Note>
            ) : !result.manifest.present ? (
              <Note tone="dim">No C2PA manifest in this file{result.manifest.error ? ` (${result.manifest.error})` : ""}.</Note>
            ) : (
              <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5">
                <dt className="text-dim">Signature</dt>
                <dd>{result.manifest.signatureValid ? <Badge tone="up">valid</Badge> : <Badge tone="down">does not validate</Badge>}</dd>
                <dt className="text-dim">Signer</dt>
                <dd>
                  {result.manifest.signer.commonName} {!result.manifest.trustedSigner && <Badge tone="warn">test certificate, not on the C2PA trust list</Badge>}
                </dd>
                <dt className="text-dim">Claims</dt>
                <dd>
                  {result.manifest.licence
                    ? `Licence #${result.manifest.licence.licenceId}, render ${result.manifest.licence.renderIndex}${result.manifestMatches === false ? " (does not match the receipt)" : result.manifestMatches ? " (matches the receipt)" : ""}`
                    : "no Likeness licence assertion"}
                </dd>
                {result.manifest.licence && (
                  <>
                    <dt className="text-dim">Made by</dt>
                    <dd>
                      {result.manifest.licence.renderer.test ? <Badge tone="warn">TEST RENDER (no model)</Badge> : `${result.manifest.licence.renderer.provider} · ${result.manifest.licence.renderer.model}`}
                    </dd>
                  </>
                )}
              </dl>
            )}
          </div>
          {result.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
