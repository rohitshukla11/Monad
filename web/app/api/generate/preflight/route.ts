import type { NextRequest } from "next/server";
import { preflight } from "@/lib/server/generate";
import { address, fail, json, licenceId } from "@/lib/server/http";
import { isConfigured } from "@/lib/server/integrations";
import { releaseState } from "@/lib/server/keyring";
import { rendererPlan } from "@/lib/server/render";
import { getGrant } from "@/lib/server/delegation";
import { geminiModels } from "@/lib/server/gemini";

/** The checks a render must pass, plus which renderer, filter and payment path would run. */

// Chain, Didit, C2PA or model calls can outlast the default function timeout on a host like Vercel.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { licenceId: raw, licensee: who, prompt } = (await req.json().catch(() => ({}))) as { licenceId?: string; licensee?: string; prompt?: string };
    const id = licenceId(String(raw ?? ""));
    const licensee = address(who, "licensee");
    const grant = await getGrant(licensee);
    return json({
      ...(await preflight(id, licensee, prompt || undefined)),
      release: releaseState(id),
      renderer: rendererPlan(),
      llmFilter: isConfigured("gemini") ? `Gemini (${geminiModels.filter()}) + local rules` : "LLM filter not configured: local rules only",
      delegation: grant && !grant.revokedAt ? { provider: grant.provider, capUsdc: grant.capUsdc, spentUsdc: grant.spentUsdc, ready: grant.provider === "dev-local" || !!grant.dynamic } : null,
      c2pa: isConfigured("c2pa") ? "test certificate" : "missing",
    });
  } catch (e) {
    return fail(e);
  }
}
