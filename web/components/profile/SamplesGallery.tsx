"use client";

/**
 * Sample renders on a creator's page, by tier: signed out, or without a completed brand profile, a
 * brand sees only that samples exist; a signed-in brand with a profile gets them (1024 px, watermarked)
 * through short-lived signed URLs the server issues to its session. Nothing here is downloadable as a
 * licensed asset; reference photos never leave the render service.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, reason } from "@/lib/client/tx";
import { startBrandSession, storedBrandSession } from "@/lib/client/brand-session";
import { btnClass, Card } from "@/components/ds";
import { IconLock } from "@/components/ds/icons";
import { Note } from "@/components/ui";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useBrandReady } from "@/components/brand/useBrandReady";

type Shown = { id: string; scene: string; url: string; test: boolean };

export function SamplesGallery({ creator, count }: { creator: string; count: number }) {
  const { wallet } = useWallet();
  const ready = useBrandReady();
  const [items, setItems] = useState<Shown[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(token: string) {
    const r = await fetch(`/api/samples?creator=${creator}`, { headers: { "x-likeness-brand": token }, cache: "no-store" });
    const j = (await r.json()) as { samples?: Shown[]; error?: string };
    if (!r.ok) throw new Error(j.error ?? `samples ${r.status}`);
    setItems(j.samples ?? []);
  }
  // A brand with a session from earlier in this tab sees the samples straight away.
  useEffect(() => {
    if (!wallet || !ready || count === 0) return;
    const t = storedBrandSession(wallet.address);
    if (t) load(t).catch((e) => setError(reason(e)));
  }, [wallet, ready, count]); // eslint-disable-line react-hooks/exhaustive-deps

  async function unlock() {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      await load(await startBrandSession(wallet));
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  }

  const tiles = Math.min(count, 6);
  return (
    <Card
      title="Sample renders"
      action={
        <span className="text-[13px] text-grey">
          {count} approved by the creator · not licensed
        </span>
      }
    >
      {count === 0 ? (
        <p className="m-0 text-[14px] text-grey">This creator hasn&apos;t published sample renders yet.</p>
      ) : items ? (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
          {items.map((s) => (
            <li key={s.id} className="flex flex-col gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={`Sample render: ${s.scene}`} className="aspect-square w-full rounded-[14px] bg-paper object-cover" loading="lazy" />
              <span className="text-[13px] font-semibold">
                {s.scene}
                {s.test ? " · TEST RENDER" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <ul aria-label={`${count} sample renders, locked`} className="m-0 grid list-none grid-cols-3 gap-3 p-0 sm:grid-cols-6">
            {Array.from({ length: tiles }, (_, i) => (
              <li key={i} aria-hidden="true" className="flex aspect-square items-center justify-center rounded-[12px] bg-paper text-grey">
                <IconLock size={18} />
              </li>
            ))}
          </ul>
          {!wallet ? (
            <p className="m-0 text-[14px] text-grey">
              Signed-in brands can see them.{" "}
              <Link href={`/brand/onboard?next=${encodeURIComponent(`/market/${creator}`)}`} className="font-semibold text-wait underline">
                Sign in as a brand
              </Link>
            </p>
          ) : !ready ? (
            <p className="m-0 text-[14px] text-grey">
              Finish your brand profile to see them.{" "}
              <Link href={`/brand/onboard?next=${encodeURIComponent(`/market/${creator}`)}`} className="font-semibold text-wait underline">
                Brand profile
              </Link>
            </p>
          ) : (
            <button type="button" onClick={unlock} disabled={busy} className={btnClass("ink", "self-start")}>
              {busy ? "Opening…" : "Show sample renders"}
            </button>
          )}
        </>
      )}
      {error && <Note tone="down">{error}</Note>}
      <p className="m-0 text-[12px] text-grey">Samples are previews, watermarked and marked in their content credentials as not a licence. Links expire after 15 minutes.</p>
    </Card>
  );
}
