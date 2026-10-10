import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import type { ReferenceSet } from "@/lib/crypto/envelope";
import { attest, AttestError } from "@/lib/server/attest";
import { json } from "@/lib/server/http";
import { assertCiphertext } from "@/lib/server/store";

// Chain, Didit, C2PA or model calls can outlast the default function timeout on a host like Vercel.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { address, referenceSet, mode } = (await req.json().catch(() => ({}))) as { address?: string; referenceSet?: ReferenceSet; mode?: string };
  if (!address || !isAddress(address) || !referenceSet) return json({ error: "bad request" }, 400);
  try {
    assertCiphertext(referenceSet);
    return json(await attest(address, referenceSet, mode === "upgrade" ? "upgrade" : "register"));
  } catch (e) {
    const status = e instanceof AttestError ? e.status : (e as { status?: number }).status ?? 500;
    return json({ error: e instanceof Error ? e.message : "attestation failed" }, status);
  }
}
