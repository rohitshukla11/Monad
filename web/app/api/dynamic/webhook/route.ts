import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getGrant, saveGrant } from "@/lib/server/delegation";
import { json } from "@/lib/server/http";

/**
 * Dynamic delegated-access webhook (https://www.dynamic.xyz/docs, delegated access: receiving
 * delegation). Signature: header x-dynamic-signature-256 = "sha256=" + HMAC-SHA256(raw body,
 * DYNAMIC_WEBHOOK_SECRET). The delegated share and wallet API key arrive encrypted to our RSA key and
 * are stored still encrypted; they are decrypted in memory only to sign an allowed payRender.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.DYNAMIC_WEBHOOK_SECRET;
  if (!secret) return json({ error: "Dynamic webhook is not configured" }, 503);
  const raw = await req.text();
  const got = req.headers.get("x-dynamic-signature-256") ?? "";
  const want = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return json({ error: "bad signature" }, 401);

  const event = JSON.parse(raw) as { eventName?: string; data?: Record<string, unknown> };
  const d = event.data ?? {};
  if (event.eventName === "wallet.delegation.created") {
    const licensee = String(d.publicKey ?? "").toLowerCase();
    const g = await getGrant(licensee);
    // A share only attaches to a grant the brand created first, with its own signed cap.
    if (!g || g.provider !== "dynamic" || g.revokedAt) {
      console.warn(JSON.stringify({ service: "dynamic-webhook", result: "no-matching-grant", licensee }));
      return json({ ok: true, attached: false });
    }
    g.dynamic = {
      walletId: String(d.walletId),
      shareSetId: d.shareSetId ? String(d.shareSetId) : undefined,
      encryptedDelegatedShare: d.encryptedDelegatedShare,
      encryptedWalletApiKey: d.encryptedWalletApiKey,
    };
    await saveGrant(g);
    console.log(JSON.stringify({ service: "dynamic-webhook", result: "delegation-attached", licensee, walletId: g.dynamic.walletId }));
    return json({ ok: true, attached: true });
  }
  if (event.eventName === "wallet.delegation.revoked") {
    const walletId = String(d.walletId ?? "");
    // Grants are keyed by address; the revoke event carries only the wallet id.
    const { dbList } = await import("@/lib/server/db");
    for (const g of await dbList<Awaited<ReturnType<typeof getGrant>> & object>("delegations")) {
      if (g.dynamic?.walletId === walletId) {
        g.revokedAt = Date.now();
        g.dynamic = undefined;
        await saveGrant(g);
      }
    }
    return json({ ok: true });
  }
  return json({ ok: true, ignored: event.eventName });
}
