import "server-only";
/**
 * Google Gemini API over REST (no SDK): one key, GEMINI_API_KEY, for both the renderer and the
 * prompt filter.
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   header x-goog-api-key. https://ai.google.dev/api/generate-content
 * generateContent rather than the newer Interactions API: it is still fully supported and does not store
 * requests (Interactions keeps them 55 days on paid keys unless store:false). Google's paid tier
 * still logs prompts for 55 days for abuse monitoring (https://ai.google.dev/gemini-api/docs/usage-policies).
 * Errors keep Google's own status and message, so a quota or billing problem reads as exactly that.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const geminiModels = {
  // "Recommended for all new projects" on https://ai.google.dev/gemini-api/docs/image-generation;
  // up to 4 character references, so the creator's 3 captures fit.
  image: () => process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1",
  filter: () => process.env.GEMINI_FILTER_MODEL || "gemini-3.5-flash-lite",
};

export type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string }; thought?: boolean };
export type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string; finishMessage?: string }[];
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  usageMetadata?: Record<string, unknown>;
};

export class GeminiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly googleStatus: string,
    message: string,
  ) {
    super(message);
  }
}

export async function generateContent(model: string, body: unknown, timeoutMs = 120_000): Promise<GeminiResponse> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError(0, "NOT_CONFIGURED", "GEMINI_API_KEY is not set");
  const r = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = (await r.json().catch(() => ({}))) as GeminiResponse & { error?: { code?: number; status?: string; message?: string } };
  if (!r.ok || j.error) {
    const status = j.error?.status ?? String(r.status);
    let msg = `Gemini ${model}: HTTP ${r.status} ${status}: ${j.error?.message ?? "no message"}`;
    if (r.status === 429 || status === "RESOURCE_EXHAUSTED")
      msg += " (quota: image models may need billing on this key's Google Cloud project; AI Studio → Billing)";
    if (status === "FAILED_PRECONDITION") msg += " (this region or project needs billing enabled for this model)";
    throw new GeminiError(r.status, status, msg);
  }
  return j;
}
