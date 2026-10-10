"use client";

/**
 * Didit's hosted verification (ID document, liveness, selfie-to-ID face match) in a new tab, at the
 * server's VERIFICATION_LEVEL: "full" uses active liveness and sends desktop users to their phone by
 * QR code; "free" uses passive liveness and allows desktop. This page only polls our server, which
 * reads Didit's decision from Didit's API; whatever the Didit tab or its redirect says is not used.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, reason } from "@/lib/client/tx";
import { Button, Note } from "@/components/ui";
import { LEVEL_SUMMARY } from "@/lib/verification";
import { diditFailure } from "@/lib/didit-messages";

type Status = {
  state: "none" | "pending" | "approved" | "declined";
  level?: "free" | "full";
  sessionStatus?: string;
  reasons?: string[];
  environment?: string;
  checks?: { document?: string; livenessMethod?: string; livenessScore?: number; faceMatchScore?: number } | null;
};

export function DiditStep({ address, onDone }: { address: string; onDone: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  const poll = useCallback(async () => {
    const s = await api<Status>(`/api/didit/status?address=${address}`);
    setStatus(s);
    if (s.state === "approved" && !done.current) {
      done.current = true;
      setTimeout(onDone, 1500);
    }
  }, [address, onDone]);

  useEffect(() => {
    poll().catch((e) => setError(reason(e)));
    const t = setInterval(() => poll().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [poll]);

  async function start() {
    setError(null);
    try {
      const r = await api<{ state: string; url?: string }>("/api/didit/session", { method: "POST", body: JSON.stringify({ address }) });
      if (r.url) {
        setUrl(r.url);
        window.open(r.url, "_blank", "noopener");
      }
      await poll();
    } catch (e) {
      setError(reason(e));
    }
  }

  const s = status?.state ?? "none";
  return (
    <div className="flex flex-col items-start gap-4">
      <h2 className="m-0 text-[20px] font-bold tracking-[-0.02em]">Verify with Didit</h2>
      <p className="m-0 max-w-3xl text-[16px] text-grey">
        Didit checks your ID document (we only learn whether you are 18 or over), runs a liveness check, and matches your face to the
        document photo. It opens in a new tab.{" "}
        {status?.level === "full" ? "On a computer it shows a QR code to finish on your phone." : "You can finish on this computer's camera or on your phone."}
      </p>
      {status?.level && (
        <Note tone={status.level === "full" ? "dim" : "warn"}>
          Verification level: {status.level} ({LEVEL_SUMMARY[status.level]}).
        </Note>
      )}
      {(s === "none" || s === "declined") && <Button onClick={start}>{s === "declined" ? "Try again" : "Start verification"}</Button>}
      {s === "pending" && (
        <div className="space-y-2">
          <Note tone="dim">Waiting for Didit’s decision ({status?.sessionStatus}). This page checks with Didit every few seconds.</Note>
          {url ? (
            <a className="inline-flex min-h-11 items-center text-[15px] font-semibold text-wait underline" href={url} target="_blank" rel="noreferrer">
              Reopen the Didit verification
            </a>
          ) : (
            <Button kind="secondary" onClick={start}>
              Reopen the Didit verification
            </Button>
          )}
        </div>
      )}
      {s === "declined" && (
        <Note tone="down">
          <b>{diditFailure(status?.reasons, status?.sessionStatus).title}.</b> {diditFailure(status?.reasons, status?.sessionStatus).help}
        </Note>
      )}
      {s === "approved" && (
        <Note tone="up">
          Verified by Didit{status?.environment === "sandbox" ? " (sandbox)" : ""}: 18 or over, liveness {status?.checks?.livenessMethod?.toLowerCase()} passed, face
          match {status?.checks?.faceMatchScore?.toFixed?.(0)}.
        </Note>
      )}
      {error && <Note tone="down">{error}</Note>}
    </div>
  );
}
