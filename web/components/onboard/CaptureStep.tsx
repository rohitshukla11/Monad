"use client";

/**
 * Guided reference photos from the camera: front, slight left, slight right, with a face outline and a
 * tip for each. Frames stay in memory as JPEG bytes. They go to the server once, over TLS, to be
 * matched against the Didit liveness selfie, and are encrypted in this browser before anything is
 * stored. Each photo shows a tick once matched; a photo that fails is retaken on its own.
 */
import { useEffect, useRef, useState } from "react";
import { pillClass } from "@/components/ds";
import { IconCamera, IconCheck, IconCross } from "@/components/ds/icons";

export const POSES = [
  { name: "Front", tip: "Face the camera with your eyes level, in even light, and keep your face inside the outline." },
  { name: "Slight left", tip: "Turn your head a little to your left. Keep both eyes visible and your face inside the outline." },
  { name: "Slight right", tip: "Turn your head a little to your right. Keep both eyes visible and your face inside the outline." },
] as const;

export type PhotoState = "empty" | "taken" | "ok" | "failed";

async function frame(video: HTMLVideoElement): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("capture failed"))), "image/jpeg", 0.9));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * `active` is the photo the camera takes next (null when none is needed). `states` and `thumbs` come
 * from the parent, which owns the bytes and the match results.
 */
export function CaptureStep({
  active,
  states,
  thumbs,
  busy,
  cameraOn,
  onCapture,
}: {
  active: number | null;
  /** False once every photo has matched: the camera is released and only the thumbnails stay. */
  cameraOn: boolean;
  states: PhotoState[];
  thumbs: (string | null)[];
  busy: boolean;
  onCapture: (index: number, bytes: Uint8Array) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!cameraOn) return;
    let stream: MediaStream | undefined;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
        setReady(true);
      })
      .catch((e: Error) => setError(e.name === "NotAllowedError" ? "Camera access was blocked. Allow the camera for this site in your browser's settings, then reload." : `Camera unavailable: ${e.message}`));
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      setReady(false);
    };
  }, [cameraOn]);

  async function take() {
    if (!video.current || active === null) return;
    onCapture(active, await frame(video.current));
  }

  const pose = active === null ? null : POSES[active];
  return (
    <div className="flex flex-col gap-5">
      {!cameraOn ? null : error ? (
        <p role="alert" className="m-0 text-[15px] text-bad">
          {error}
        </p>
      ) : (
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="relative aspect-video w-full max-w-[520px] overflow-hidden rounded-[22px] bg-ink">
            <video ref={video} autoPlay playsInline muted aria-label="Camera preview" className="h-full w-full -scale-x-100 object-cover" />
            {/* Face outline */}
            <svg aria-hidden="true" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 h-full w-full">
              <ellipse cx="80" cy="44" rx="21" ry="29" fill="none" stroke="#DCF37B" strokeWidth="0.9" strokeDasharray="3 2" />
            </svg>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {pose ? (
              <>
                <p role="status" className="m-0 text-[14px] font-semibold text-grey">
                  {states[active!] === "failed" ? `Retake photo ${active! + 1}` : `Photo ${active! + 1} of 3`} · {pose.name}
                </p>
                <p className="m-0 text-[15px]">{pose.tip}</p>
                <button type="button" onClick={take} disabled={!ready || busy} className={pillClass("ink", "self-start")}>
                  <IconCamera size={18} /> {states[active!] === "failed" ? "Retake photo" : "Take photo"}
                </button>
              </>
            ) : (
              <p role="status" className="m-0 text-[15px] text-grey">
                {busy ? "Checking your photos against your selfie…" : "All three photos taken."}
              </p>
            )}
            <p className="m-0 text-[13px] text-grey">Photos stay in this browser&apos;s memory until they are encrypted.</p>
          </div>
        </div>
      )}

      <ol aria-label="Your three photos" className="m-0 grid list-none grid-cols-3 gap-3 p-0 sm:max-w-[520px]">
        {POSES.map((p, i) => (
          <li key={p.name} className="flex flex-col gap-2">
            <div className={`relative aspect-[4/3] overflow-hidden rounded-[16px] border-2 ${states[i] === "failed" ? "border-bad" : i === active ? "border-ink" : "border-field"} bg-paper`}>
              {thumbs[i] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[i]!} alt="" className="h-full w-full -scale-x-100 object-cover" />
              )}
              {(states[i] === "ok" || states[i] === "failed") && (
                <span aria-hidden="true" className={`absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full ${states[i] === "ok" ? "bg-lime" : "bg-coral"}`}>
                  {states[i] === "ok" ? <IconCheck size={15} stroke="#121316" /> : <IconCross size={13} stroke="#121316" />}
                </span>
              )}
            </div>
            <span className="text-[13px] font-medium">
              {p.name}
              <span className="sr-only">
                {states[i] === "ok" ? ": matched" : states[i] === "failed" ? ": did not match" : states[i] === "taken" ? ": taken" : ": not taken yet"}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
