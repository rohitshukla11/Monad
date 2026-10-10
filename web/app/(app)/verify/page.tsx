"use client";

/**
 * Verify (Verify.dc.html): anyone drops a file (hashed and its C2PA manifest read on the server, not
 * stored) or pastes its sha256, and sees Licensed, Revoked ("licensed when made, since revoked"),
 * Expired or Unknown, with the creator, the licensee and the checks behind the answer.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useBrandCards, useProfiles } from "@/lib/client/profiles";
import { BrandChip, CreatorFace, CardRings, HeroHeadline, HeroLine, Initial, InlinePill, Panel, pillClass, StatusPill, TagChip } from "@/components/ds";
import { IconCheck, IconCross, IconQuestion, IconUpload } from "@/components/ds/icons";
import { fmtDate, fmtDay, Tx, inputClass } from "@/components/ui";
import type { Trust } from "@/lib/licensing";

type V = {
  verdict: "Licensed" | "Expired" | "Revoked" | "Unknown" | "ProfilePhoto" | "Sample";
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
  preview?: { kind: "profile-photo" | "sample-render"; status: "pending" | "live" | "removed"; publishedAt: number; removedAt?: number; aiGenerated?: boolean } | null;
  notes: string[];
};

const LOOK = {
  Licensed: { tone: "lime", bg: "bg-lime", stroke: "#DCF37B", stamp: "Licensed", icon: IconCheck },
  Revoked: { tone: "coral", bg: "bg-coral", stroke: "#F7A4A1", stamp: "Since revoked", icon: IconCross },
  Expired: { tone: "grey", bg: "bg-[#D9DCE2]", stroke: "#D9DCE2", stamp: "Expired", icon: IconQuestion },
  Unknown: { tone: "grey", bg: "bg-[#D9DCE2]", stroke: "#D9DCE2", stamp: "Unknown", icon: IconQuestion },
  ProfilePhoto: { tone: "lavender", bg: "bg-lavender", stroke: "#ECE6FD", stamp: "Profile photo", icon: IconQuestion },
  Sample: { tone: "lavender", bg: "bg-lavender", stroke: "#ECE6FD", stamp: "Sample render", icon: IconQuestion },
} as const;

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
  const [brand, setBrand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<{ url: string; size: number; type: string } | null>(null);

  const run = useCallback(async (f: () => Promise<Response>) => {
    setBusy(true);
    setError(null);
    setResult(null);
    setBrand(null);
    try {
      const r = await f();
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setResult(j);
      if (j.licence?.id)
        fetch(`/api/licences/${j.licence.id}`, { cache: "no-store" })
          .then((x) => x.json())
          .then((d) => setBrand(d.brief?.brand ?? null))
          .catch(() => {});
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

  function onFile(f: File | undefined) {
    if (!f) return;
    setFile({ url: URL.createObjectURL(f), size: f.size, type: f.type });
    const form = new FormData();
    form.append("file", f);
    void run(() => fetch("/api/verify", { method: "POST", body: form }));
  }

  const look = result ? LOOK[result.verdict] : null;
  const faces = useProfiles(result?.creator ? [result.creator.address] : []);
  const brands = useBrandCards(result?.licence ? [result.licence.licensee] : []);
  const Icon = look?.icon ?? IconUpload;
  const m = result?.manifest && result.manifest.present ? result.manifest : null;
  const l = result?.licence;

  return (
    <>
      <section className="on-dark mx-auto flex max-w-[1320px] flex-wrap items-stretch gap-10 px-4 pb-[84px] pt-7 text-white sm:px-8 sm:pt-9">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-1">
          <HeroHeadline label="Was this face licensed?" className="flex-none">
            <HeroLine>
              Was this
              <InlinePill icon={<IconCheck size={20} stroke="#DCF37B" />} />
            </HeroLine>
            <HeroLine>face licensed?</HeroLine>
          </HeroHeadline>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files[0]);
            }}
            className="relative mt-4 flex min-h-[64px] cursor-pointer items-center gap-3 rounded-[18px] border border-dashed border-[#4A4D55] bg-ink-raised py-2 pl-5 pr-2 text-[clamp(15px,1.3vw,17px)] font-medium text-grey-dark focus-within:outline focus-within:outline-[3px] focus-within:outline-lime"
          >
            <span className="flex-1">{busy ? "Checking…" : "Drop an image, or choose a file"}</span>
            <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-lime text-ink">
              <IconUpload size={20} />
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (/^0x[0-9a-fA-F]{64}$/.test(hash.trim())) void byHash(hash);
            }}
            className="mt-3 flex flex-wrap items-center gap-2 text-[15px]"
          >
            <label htmlFor="hash" className="text-grey-dark">
              or check a sha256:
            </label>
            <input
              id="hash"
              className="min-h-11 min-w-0 flex-[1_1_260px] rounded-full border border-ink-line-2 bg-ink-raised px-4 font-mono text-[13px] text-white placeholder:text-grey-dark"
              placeholder="0x…"
              value={hash}
              onChange={(e) => setHash(e.target.value)}
            />
            <button type="submit" disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(hash.trim())} className={pillClass("white")}>
              Look up
            </button>
          </form>
        </div>

        <article
          aria-label="Result"
          aria-live="polite"
          className={`relative flex min-h-[260px] min-w-0 flex-[1_1_380px] flex-col justify-between gap-4 overflow-hidden rounded-[26px] p-6 text-ink ${look?.bg ?? "bg-ink-raised text-white"}`}
        >
          {look && <CardRings />}
          <div className="relative flex items-start justify-between">
            <span aria-hidden="true" className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-ink">
              <Icon size={22} stroke={look?.stroke ?? "#DCF37B"} />
            </span>
            {l && <span className="rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-white">Licence #{l.id.padStart(4, "0")}</span>}
          </div>
          <div className="relative flex flex-col gap-2">
            {result ? (
              <>
                <span className="text-[clamp(28px,3.2vw,38px)] font-extrabold leading-none tracking-[-0.02em]">{look!.stamp}</span>
                <span className="text-[15px] font-medium leading-snug">{subline(result)}</span>
              </>
            ) : (
              <>
                <span className="text-[clamp(24px,2.8vw,32px)] font-extrabold leading-none tracking-[-0.02em]">{busy ? "Checking…" : "Ready when you are"}</span>
                <span className="text-[15px] font-medium leading-snug text-grey-dark">
                  {error ?? "We hash the file, read its content credential, and look up its receipt on Monad. Nothing is stored."}
                </span>
              </>
            )}
          </div>
        </article>
      </section>

      <Panel>
        {!result && !error && (
          <p className="m-0 text-[15px] text-grey">
            Every render made through Likeness carries a C2PA content credential and an on-chain receipt keyed by the file&apos;s sha256. Edited or re-encoded copies
            come back Unknown.
          </p>
        )}
        {error && <p className="m-0 text-[15px] text-bad">{error}</p>}
        {result && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            <figure className="m-0 flex flex-col gap-3 rounded-[26px] bg-white p-3.5 lg:row-span-2">
              {file ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.url} alt="The checked image" className="min-h-[200px] w-full flex-1 rounded-[18px] object-cover" />
              ) : (
                <div className="flex min-h-[200px] flex-1 items-center justify-center rounded-[18px] bg-[#E3E6EC] p-4 text-center text-[14px] text-grey">Checked by hash only, no file</div>
              )}
              <figcaption className="break-all text-[13px] text-grey">
                asset {result.assetHash.slice(0, 6)}…{result.assetHash.slice(-4)}
                {file ? ` · ${Math.round(file.size / 1024)} KB · ${file.type.replace("image/", "").toUpperCase()}` : ""}
              </figcaption>
            </figure>

            <div className="flex flex-col gap-3 rounded-[26px] bg-white p-6">
              <span className="text-[15px] text-grey">Creator</span>
              {result.creator ? (
                <>
                  <Link href={`/market/${result.creator.address}`} className="flex items-center gap-3 text-ink no-underline">
                    <CreatorFace seed={result.creator.address} photo={faces[result.creator.address.toLowerCase()]?.photo} />
                    <span className="tnum text-[17px] font-semibold">
                      {result.creator.address.slice(0, 6)}…{result.creator.address.slice(-4)}
                    </span>
                  </Link>
                  <TrustPill trust={result.creator.trust} />
                </>
              ) : (
                <span className="text-[15px] text-grey">No licensed creator for this file</span>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-[26px] bg-white p-6">
              <span className="text-[15px] text-grey">Licensee</span>
              {l ? (
                <>
                  <span className="text-[16px]">
                    <BrandChip brand={brands[l.licensee.toLowerCase()]} fallback={brand ?? `${l.licensee.slice(0, 6)}…${l.licensee.slice(-4)}`} />
                  </span>
                  <span className="self-start">
                    <TagChip>{l.use}</TagChip>
                  </span>
                </>
              ) : (
                <span className="text-[15px] text-grey">None on record</span>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-[26px] bg-white p-6">
              <span className="text-[15px] text-grey">Licence now</span>
              <span className="text-[20px] font-bold">{l ? (l.status === "Exhausted" ? "Used up" : l.status === "Active" ? "Active" : l.status) : "None"}</span>
              <span className="text-[14px] text-grey">{licenceDetail(result)}</span>
            </div>

            <ul className="on-dark m-0 grid list-none grid-cols-1 gap-x-7 gap-y-3.5 rounded-[26px] bg-ink p-[26px] text-[15px] text-white sm:grid-cols-2 lg:col-span-3">
              <Check ok={!!m?.signatureValid}>
                {m
                  ? m.signatureValid
                    ? `Content credential intact${m.trustedSigner ? "" : " · test certificate"}`
                    : "Content credential does not validate"
                  : result.manifest === null
                    ? "Content credential not read (checked by hash)"
                    : "No content credential in this file"}
              </Check>
              <Check ok={!!result.receipt}>
                {result.receipt ? (
                  <>
                    Receipt on Monad
                    {result.receipt.tx && (
                      <>
                        {" · "}
                        <a href={`https://testnet.monadvision.com/tx/${result.receipt.tx}`} target="_blank" rel="noreferrer" className="text-lime underline-offset-2 hover:underline">
                          view transaction<span className="sr-only"> (opens MonadVision)</span>
                        </a>
                      </>
                    )}
                  </>
                ) : (
                  "No receipt on Monad for these exact bytes"
                )}
              </Check>
              <Check ok={result.creator?.trust.level === "verified"}>
                {result.creator?.trust.level === "verified" ? "Creator attested by Didit, 18+" : "No Didit-attested creator"}
              </Check>
              <Check ok={!!result.receipt}>
                {result.receipt ? `Made ${fmtDate(result.receipt.renderedAt)}${m ? " · marked AI-generated" : ""}` : "No record of when it was made"}
              </Check>
            </ul>

            {result.manifest?.present && (
              <section aria-labelledby="c2pa-title" className="flex flex-col gap-3 rounded-[26px] bg-white p-6 lg:col-span-4">
                <h2 id="c2pa-title" className="m-0 text-[17px] font-semibold">
                  Content credential (C2PA)
                </h2>
                <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 text-[15px] sm:grid-cols-[9rem_1fr]">
                  <dt className="text-grey">Signature</dt>
                  <dd className="m-0">{result.manifest.signatureValid ? <StatusPill kind="licensed">valid</StatusPill> : <StatusPill kind="revoked">does not validate</StatusPill>}</dd>
                  <dt className="text-grey">Signed by</dt>
                  <dd className="m-0 flex flex-wrap items-center gap-2">
                    {result.manifest.signer.commonName ?? "unknown"}
                    {!result.manifest.trustedSigner && <StatusPill kind="waiting">test certificate, not on the C2PA trust list</StatusPill>}
                  </dd>
                  <dt className="text-grey">Claims</dt>
                  <dd className="m-0">
                    {result.manifest.licence
                      ? `Licence #${result.manifest.licence.licenceId}, render ${result.manifest.licence.renderIndex}${result.manifestMatches === false ? " (does not match the receipt)" : result.manifestMatches ? " (matches the receipt)" : ""}`
                      : "No licence claim"}
                  </dd>
                  {result.manifest.licence && (
                    <>
                      <dt className="text-grey">Renderer</dt>
                      <dd className="m-0">
                        {result.manifest.licence.renderer.test ? (
                          <StatusPill kind="waiting">TEST RENDER (no model)</StatusPill>
                        ) : (
                          `${result.manifest.licence.renderer.provider} · ${result.manifest.licence.renderer.model}`
                        )}
                      </dd>
                    </>
                  )}
                </dl>
              </section>
            )}
            {result.manifest && !result.manifest.present && result.manifest.error && (
              <p className="m-0 text-[14px] text-grey lg:col-span-4">No C2PA manifest in this file ({result.manifest.error}).</p>
            )}
            {result.revoked && (
              <p className="m-0 text-[14px] text-grey lg:col-span-4">
                Revoked {fmtDate(result.revoked.at)}: <Tx hash={result.revoked.tx} />
              </p>
            )}
            {result.notes.length > 0 && (
              <ul className="m-0 list-disc space-y-1 pl-5 text-[14px] text-grey lg:col-span-4">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}

function subline(v: V): string {
  switch (v.verdict) {
    case "Licensed":
      return "Made under an active licence the person in it approved, paid for and recorded on Monad.";
    case "Revoked":
      return "Licensed when it was made. The creator revoked the licence afterwards, so it should not be used in new placements.";
    case "Expired":
      return "Licensed when it was made. The licence period has ended.";
    case "ProfilePhoto":
      return `${v.preview?.aiGenerated ? "AI-generated profile image" : "Profile photo"} of a Likeness creator: a preview, not a licensed asset.${v.preview?.status === "removed" ? " The creator has since taken it down." : ""}`;
    case "Sample":
      return `Sample render: not a licence to use this face.${v.preview?.status === "removed" ? " The creator has since taken it down." : ""}`;
    default:
      return v.headline;
  }
}

function licenceDetail(v: V): string {
  const l = v.licence;
  if (!l) return "No licence is recorded for these bytes.";
  if (v.revoked) return `By the ${v.revoked.how === "suspension" ? "platform (creator suspended)" : "creator"}, ${fmtDate(v.revoked.at)}`;
  if (l.status === "Active") {
    const [used, cap] = l.renders.split(" of ").map(Number);
    return `Until ${fmtDay(l.end)} · ${cap - used} render${cap - used === 1 ? "" : "s"} left`;
  }
  return `Ended ${fmtDay(l.end)}`;
}

function TrustPill({ trust }: { trust: Trust }) {
  if (trust.level === "verified")
    return (
      <span className="self-start">
        <StatusPill kind="waiting">Verified human · {trust.livenessMethod === "passive" ? "passive" : "active"}</StatusPill>
      </span>
    );
  return (
    <span className="self-start">
      <StatusPill kind="revoked">{trust.level === "unverified-test" ? "Unverified test creator" : "Unknown attestation"}</StatusPill>
    </span>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ok ? "bg-lime" : "bg-[#3A3D44]"}`}>
        {ok ? <IconCheck size={16} stroke="#121316" /> : <IconCross size={14} stroke="#B9BCC4" />}
      </span>
      <span>
        <span className="sr-only">{ok ? "Passed: " : "Not passed: "}</span>
        {children}
      </span>
    </li>
  );
}
