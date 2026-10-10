"use client";

/**
 * Three guided captures from the camera. Frames stay in memory as JPEG bytes: they go to the server
 * once, over TLS, to be matched against the Didit liveness selfie (Didit 1:1 face match), and are then encrypted here
 * before anything is stored.
 */
import { useEffect, useRef, useState } from "react";

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

  if (error) return <p className="text-sm text-down">Camera unavailable: {error}</p>;
  return (
    <div className="flex gap-8">
      <video ref={video} autoPlay playsInline muted className="w-[480px] -scale-x-100 rounded-card bg-surface" />
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Photo {Math.min(shots.length + 1, POSES.length)} of {POSES.length}
        </p>
        <p className="font-display text-lg">{POSES[Math.min(shots.length, POSES.length - 1)]}</p>
        <button
          onClick={take}
          disabled={shots.length >= POSES.length}
          className="rounded-full bg-text px-5 py-2.5 text-sm font-semibold text-ground disabled:opacity-50"
        >
          Take photo
        </button>
        <p className="max-w-xs text-xs text-dim">Photos stay in this browser's memory until they are encrypted.</p>
      </div>
    </div>
  );
}
