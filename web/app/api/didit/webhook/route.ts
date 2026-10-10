import type { NextRequest } from "next/server";
import type { Address } from "viem";
import { evaluate, getIdentity, saveIdentity, verifyWebhook, type Decision } from "@/lib/server/didit";
import { json } from "@/lib/server/http";

/**
 * Didit webhook (status.updated). Optional: the status route polls Didit as well. Signed with
 * DIDIT_WEBHOOK_SECRET (X-Signature-V2 over canonical JSON, or X-Signature over the raw body), and
 * only applied to the session we created for that wallet.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) return json({ error: "Didit webhook is not configured" }, 503);
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers, secret)) return json({ error: "bad signature" }, 401);
  const e = JSON.parse(raw) as { webhook_type?: string; session_id?: string; vendor_data?: string; status?: string; environment?: "live" | "sandbox"; decision?: Decision };
  if (e.webhook_type !== "status.updated" || !e.vendor_data || !e.session_id) return json({ ok: true, ignored: e.webhook_type });
  const i = await getIdentity(e.vendor_data.split(":")[0]);
  if (!i || i.sessionId !== e.session_id) return json({ ok: true, ignored: "unknown session" });
  if (i.state !== "pending") return json({ ok: true, state: i.state });
  const decision: Decision = e.decision ?? { session_id: e.session_id, status: e.status ?? "Unknown", environment: e.environment };
  const v = evaluate({ ...decision, environment: decision.environment ?? e.environment });
  await saveIdentity({ ...i, ...v, address: i.address as Address, decidedAt: v.state === "pending" ? undefined : Date.now() });
  return json({ ok: true, state: v.state });
}
