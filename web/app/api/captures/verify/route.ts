import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { verifyAction } from "@/lib/server/auth";
import { CaptureError, verifyCaptures } from "@/lib/server/captures";
import { address, fail, HttpError, json } from "@/lib/server/http";

const MAX_CAPTURE = 1_500_000;

/**
 * The three guided photos, each matched against the creator's Didit liveness selfie. Held in memory,
 * never written; Didit is asked not to store them. Signed by the wallet ("Likeness: verify reference
 * photos" over the photos' sha256), since each match is a paid Didit call.
 */

// On a cold start the free-level matcher may first fetch its weights (about 260 MB) before matching.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let bytes: Uint8Array[] = [];
  try {
    const { address: raw, captures, auth } = (await req.json().catch(() => ({}))) as { address?: string; captures?: string[]; auth?: SignedAction };
    const who = address(raw);
    if (!Array.isArray(captures) || captures.length !== 3) throw new HttpError(400, "send exactly 3 photos");
    bytes = captures.map((c) => Uint8Array.from(Buffer.from(c, "base64")));
    if (bytes.some((b) => b.length === 0 || b.length > MAX_CAPTURE)) throw new HttpError(413, "photo size");
    const f = await verifyAction(auth, "verify reference photos", who);
    const digests = bytes.map((b) => createHash("sha256").update(b).digest("hex")).join(",");
    if (f.photos !== digests) throw new HttpError(400, "signed statement does not match these photos");
    const r = await verifyCaptures(who, bytes);
    return json({ scores: r.scores, matcher: r.matcher });
  } catch (e) {
    if (e instanceof CaptureError) return json({ error: e.message }, e.status);
    return fail(e);
  } finally {
    for (const b of bytes) b.fill(0);
  }
}
