import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import type { SignedAction } from "@/lib/auth";
import { verifyAction } from "@/lib/server/auth";
import { generate, GenerateError } from "@/lib/server/generate";
import { address, fail, HttpError, json, licenceId } from "@/lib/server/http";
import { readLicence } from "@/lib/server/protocol";

export const maxDuration = 300;

/**
 * Render under a licence. The brand's wallet signs "Likeness: render" over the licence id, the
 * prompt's sha256 and the payment mode, so nobody else can spend its escrow.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { licenceId?: string; prompt?: string; mode?: string; auth?: SignedAction };
    const id = licenceId(String(body.licenceId ?? ""));
    const prompt = String(body.prompt ?? "");
    const mode = body.mode === "wallet" ? "wallet" : "delegated";
    const l = await readLicence(id);
    if (!l) throw new HttpError(404, "no such licence");
    const f = await verifyAction(body.auth, "render", address(l.licensee));
    if (f.licence !== id.toString() || f.mode !== mode || f["prompt sha256"] !== createHash("sha256").update(prompt).digest("hex"))
      throw new HttpError(400, "signed statement does not match this render");
    return json(await generate({ licenceId: id, licensee: l.licensee, prompt, mode }));
  } catch (e) {
    if (e instanceof GenerateError) return json({ error: e.message, details: e.details }, e.status);
    return fail(e);
  }
}
