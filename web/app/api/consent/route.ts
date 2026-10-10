import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { CONSENT_VERSION, consentTextHash } from "@/lib/consent";
import { verifyAction } from "@/lib/server/auth";
import { dbGet, dbPut } from "@/lib/server/db";
import { address, fail, HttpError, json } from "@/lib/server/http";

export type ConsentRecord = { address: string; version: string; textSha256: string; message: string; signature: string; at: number };

/**
 * The creator's consent, before any verification: a wallet-signed statement naming the consent
 * version and the sha256 of its exact text. Stored as the record attestation relies on.
 */
export async function POST(req: NextRequest) {
  try {
    const { address: raw, auth } = (await req.json().catch(() => ({}))) as { address?: string; auth?: SignedAction };
    const who = address(raw);
    const f = await verifyAction(auth, "consent to identity verification and likeness licensing", who);
    if (f.wallet?.toLowerCase() !== who || f.version !== CONSENT_VERSION || f["text sha256"] !== (await consentTextHash()))
      throw new HttpError(400, "consent statement does not match the current consent text");
    const record: ConsentRecord = { address: who, version: CONSENT_VERSION, textSha256: f["text sha256"], message: auth!.message, signature: auth!.signature, at: Date.now() };
    await dbPut("consents", who, record);
    return json({ ok: true, version: CONSENT_VERSION, at: record.at }, 201);
  } catch (e) {
    return fail(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const who = address(req.nextUrl.searchParams.get("address"));
    const r = await dbGet<ConsentRecord>("consents", who);
    return json({ consented: !!r && r.version === CONSENT_VERSION, version: r?.version ?? null, at: r?.at ?? null });
  } catch (e) {
    return fail(e);
  }
}
