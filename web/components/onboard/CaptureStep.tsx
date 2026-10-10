"use client";

/**
 * Three guided captures from the camera. Frames stay in memory as JPEG bytes: they go to the server
 * once, over TLS, to be matched against the Didit liveness selfie (Didit 1:1 face match), and are then encrypted here
 * before anything is stored.
 */
import { useEffect, useRef, useState } from "react";
import { pillClass } from "@/components/ds";
import { IconCamera } from "@/components/ds/icons";

const POSES = ["Look straight at the camera", "Turn slightly to your left", "Turn slightly to your right"];

async function frame(video: HTMLVideoElement): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("capture failed"))), "image/jpeg", 0.9));
  return new Uint8Array(await blob.arrayBuffer());
}

export function CaptureStep({ onDone }: { onDone: (captures: Uint8Array[]) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [shots, setShots] = useState<Uint8Array[]>([]);
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
    if (!video.current) return;
    const next = [...shots, await frame(video.current)];
    setShots(next);
    if (next.length === POSES.length) onDone(next);
  }

  if (error) return <p role="alert" className="m-0 text-[15px] text-bad">Camera unavailable: {error}</p>;
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
      <video ref={video} autoPlay playsInline muted aria-label="Camera preview" className="aspect-video w-full max-w-[480px] -scale-x-100 rounded-[26px] bg-ink object-cover" />
      <div className="flex flex-col gap-4">
        <p role="status" className="m-0 text-[15px] text-grey">
          Photo {Math.min(shots.length + 1, POSES.length)} of {POSES.length}
        </p>
        <ol aria-label="Poses" className="m-0 flex list-none gap-2 p-0">
          {POSES.map((p, i) => (
            <li key={p} aria-label={`${p}${i < shots.length ? " (taken)" : ""}`} className={`h-2.5 w-10 rounded-full ${i < shots.length ? "bg-ok" : i === shots.length ? "bg-ink" : "bg-field"}`} />
          ))}
        </ol>
        <p className="m-0 text-[22px] font-semibold">{POSES[Math.min(shots.length, POSES.length - 1)]}</p>
        <button type="button" onClick={take} disabled={shots.length >= POSES.length} className={pillClass("ink", "self-start min-h-[54px] px-7")}>
          <IconCamera size={18} /> Take photo
        </button>
        <p className="m-0 max-w-xs text-[13px] text-grey">Photos stay in this browser&apos;s memory until they are encrypted.</p>
      </div>
    </div>
  );
}
