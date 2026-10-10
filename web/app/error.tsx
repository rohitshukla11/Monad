"use client";

import { useEffect } from "react";
import { NoticePage, pillClass } from "@/components/ds";
import { AppHeader } from "@/components/site/AppHeader";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="min-h-screen bg-ink text-white">
      <AppHeader />
      <main id="main" className="text-ink">
        <NoticePage
          title="Something went wrong"
          kicker="Error"
          action={
            <button type="button" onClick={() => retry()} className={pillClass("ink")}>
              Try again
            </button>
          }
        >
          This page could not load. Nothing was signed or sent. If the Monad testnet RPC is busy, trying again in a moment usually works.
          {error.digest && <span className="mt-2 block font-mono text-[13px]">Reference: {error.digest}</span>}
        </NoticePage>
      </main>
    </div>
  );
}
