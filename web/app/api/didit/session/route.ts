import type { NextRequest } from "next/server";
import { CONSENT_VERSION } from "@/lib/consent";
import { dbGet } from "@/lib/server/db";
import { createSession, getIdentity, saveIdentity, verificationLevel } from "@/lib/server/didit";
import { address, fail, HttpError, json } from "@/lib/server/http";

/**
 * Start (or resume) this wallet's Didit verification. Requires the signed consent first. Returns the
 * hosted verification URL; the result is read later from Didit's server API, never from the browser.
 */

// Chain, Didit, C2PA or model calls can outlast the default function timeout on a host like Vercel.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { address: raw } = (await req.json().catch(() => ({}))) as { address?: string };
    const who = address(raw);
    const consent = await dbGet<{ version: string }>("consents", who);
    if (consent?.version !== CONSENT_VERSION) throw new HttpError(409, "sign the creator consent first");
    const existing = await getIdentity(who);
    const level = verificationLevel();
    if (existing?.state === "approved" && existing.level === level) return json({ state: "approved", sessionId: existing.sessionId, level });
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const s = await createSession(who, `${origin}/onboard?didit=returned`);
    if (existing?.sessionId !== s.session_id || existing.state !== "pending")
      await saveIdentity({ address: who, sessionId: s.session_id, level, environment: "unknown", state: "pending", sessionStatus: s.status, reasons: [], createdAt: Date.now() });
    return json({ state: "pending", sessionId: s.session_id, url: s.url, level });
  } catch (e) {
    return fail(e);
  }
}
