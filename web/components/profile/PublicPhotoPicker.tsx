"use client";

/**
 * "Choose your public photo": one of the creator's three attested photos, or a new one from the camera.
 * The server checks the choice against an attested reference photo before publishing it (512 px,
 * metadata removed, watermarked, C2PA "profile photo, not a licensed asset").
 */
import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { actionMessage } from "@/lib/auth";
import { api, reason } from "@/lib/client/tx";
import { sha256Hex, type ReferenceSet } from "@/lib/crypto/envelope";
import { pillClass } from "@/components/ds";
import { IconCamera, IconCheck } from "@/components/ds/icons";
import { Note } from "@/components/ui";
import type { ActiveWallet } from "@/components/wallet/WalletProvider";
import { openReferencePhotos, toB64 } from "./reference";

type Source = { photos: Uint8Array[]; set: ReferenceSet };

export function PublicPhotoPicker({
  wallet,
  referenceSetHash,
  initial,
  onDone,
  onSkip,
}: {
  wallet: ActiveWallet;
  referenceSetHash: Hex;
  /** In onboarding: the photos just taken and their sealed set (no second Face ID prompt). */
  initial?: Source;
  onDone: (photoUrl: string) => void;
  onSkip?: () => void;
}) {
  const [src, setSrc] = useState<Source | null>(initial ?? null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [choice, setChoice] = useState<number | "camera" | null>(null);
  const [fresh, setFresh] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;
    const urls = src.photos.map((p) => URL.createObjectURL(new Blob([p as BlobPart], { type: "image/jpeg" })));
    setThumbs(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [src]);
  // Decrypted photos are zeroed when the picker goes away.
  const srcRef = useRef(src);
  srcRef.current = src;
  useEffect(() => () => srcRef.current?.photos.forEach((p) => p.fill(0)), []);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      setSrc(await openReferencePhotos(wallet, referenceSetHash));
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!src || choice === null) return;
    setBusy(true);
    setError(null);
    try {
      const photo = choice === "camera" ? fresh! : src.photos[choice];
      // The attested reference it is checked against: another of the three when one of them was chosen.
      const reference = src.photos[choice === "camera" ? 0 : (choice + 1) % src.photos.length];
      const message = actionMessage("set public photo", { wallet: wallet.address.toLowerCase(), "photo sha256": await sha256Hex(photo) });
      const signature = await wallet.client.signMessage({ account: wallet.client.account, message });
      const r = await api<{ photo: string }>("/api/profiles/photo", {
        method: "POST",
        body: JSON.stringify({ address: wallet.address, auth: { message, signature }, set: src.set, reference: toB64(reference), photo: toB64(photo) }),
      });
      onDone(r.photo);
    } catch (e) {
      setError(reason(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">Choose your public photo</h2>
        <p className="m-0 max-w-3xl text-[15px] text-grey">
          Brands see it in the marketplace. It is checked against your verified face, then published at 512 px with a &quot;not licensed for reuse&quot; watermark.
          You need one to be listed; you can change or remove it any time.
        </p>
      </div>
      {!src ? (
        <button type="button" onClick={open} disabled={busy} className={pillClass("ink", "self-start")}>
          {busy ? "Opening…" : "Open my photos with Face ID"}
        </button>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4" aria-label="Pick a photo">
          {thumbs.map((t, i) => (
            <li key={t}>
              <button
                type="button"
                aria-pressed={choice === i}
                onClick={() => setChoice(i)}
                className={`relative block w-full overflow-hidden rounded-[16px] border-[3px] ${choice === i ? "border-ink" : "border-transparent"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t} alt={`Photo ${i + 1}`} className="aspect-square w-full -scale-x-100 object-cover" />
                {choice === i && (
                  <span aria-hidden="true" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-lime">
                    <IconCheck size={15} stroke="#121316" />
                  </span>
                )}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-pressed={choice === "camera"}
              onClick={() => setChoice("camera")}
              className={`flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[16px] border-[3px] bg-paper text-[14px] font-semibold ${choice === "camera" ? "border-ink" : "border-dashed border-field"}`}
            >
              <IconCamera size={22} /> Take a new one
            </button>
          </li>
        </ul>
      )}
      {choice === "camera" && <OneShot onShot={setFresh} />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={publish} disabled={busy || !src || choice === null || (choice === "camera" && !fresh)} className={pillClass("lime")}>
          {busy && src ? "Checking and publishing…" : "Use this photo"}
        </button>
        {onSkip && (
          <button type="button" onClick={onSkip} disabled={busy} className={pillClass("ghost")}>
            Skip for now
          </button>
        )}
      </div>
      {onSkip && <p className="m-0 text-[13px] text-grey">If you skip, you stay unlisted with a silhouette until you add one from your dashboard.</p>}
      {error && <Note tone="down">{error}</Note>}
    </div>
  );
}

/** A single camera frame, for "Take a new one". */
function OneShot({ onShot }: { onShot: (b: Uint8Array) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | undefined;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch((e: Error) => setError(e.message));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  async function take() {
    const v = video.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("capture failed"))), "image/jpeg", 0.92));
    onShot(new Uint8Array(await blob.arrayBuffer()));
    setShot(URL.createObjectURL(blob));
  }
  if (error) return <p className="m-0 text-[15px] text-bad">Camera unavailable: {error}</p>;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <video ref={video} autoPlay playsInline muted aria-label="Camera preview" className="aspect-video w-full max-w-[420px] -scale-x-100 rounded-[18px] bg-ink object-cover" />
      <div className="flex flex-col gap-2">
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} alt="Your new photo" className="h-24 w-24 -scale-x-100 rounded-[14px] object-cover" />
        )}
        <button type="button" onClick={take} className={pillClass("ink", "self-start")}>
          <IconCamera size={18} /> {shot ? "Retake" : "Take photo"}
        </button>
      </div>
    </div>
  );
}
