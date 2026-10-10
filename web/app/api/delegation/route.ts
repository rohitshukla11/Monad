import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { verifyAction } from "@/lib/server/auth";
import { dynamicSignerRule, getGrant, saveGrant, type Grant } from "@/lib/server/delegation";
import { address, fail, HttpError, json } from "@/lib/server/http";
import { isConfigured } from "@/lib/server/integrations";

const publicGrant = (g: Grant | null) => g && { ...g, dynamic: g.dynamic ? { walletId: g.dynamic.walletId, delegated: true } : undefined };

/** A brand's delegation grant, plus the signer rule its browser should install with Dynamic. */
export async function GET(req: NextRequest) {
  try {
    const licensee = address(req.nextUrl.searchParams.get("licensee"), "licensee");
    return json({
      grant: publicGrant(await getGrant(licensee)),
      rule: await dynamicSignerRule(),
      available: { dynamic: isConfigured("dynamic-delegation"), devLocal: process.env.DEV_DELEGATION === "1" },
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Create (or re-cap) a grant. Signed by the brand's wallet: "Likeness: delegate render payments".
 * provider "dynamic": the grant waits for Dynamic's wallet.delegation.created webhook to carry the share.
 * provider "dev-local": seeded test brands only, with DEV_DELEGATION=1.
 */
export async function POST(req: NextRequest) {
  try {
    const { licensee: raw, auth } = (await req.json().catch(() => ({}))) as { licensee?: string; auth?: SignedAction };
    const licensee = address(raw, "licensee");
    const f = await verifyAction(auth, "delegate render payments", licensee);
    if (f.wallet?.toLowerCase() !== licensee || f.contract === undefined) throw new HttpError(400, "signed statement does not match");
    const cap = BigInt(f["total cap (USDC units)"] ?? "0");
    if (cap <= 0n) throw new HttpError(400, "set a total cap");
    const provider = f.provider as Grant["provider"];
    if (provider === "dev-local" && process.env.DEV_DELEGATION !== "1") throw new HttpError(403, "dev delegation is off");
    if (provider === "dynamic" && !isConfigured("dynamic-delegation")) throw new HttpError(503, "Dynamic delegated access is not configured");
    if (provider !== "dev-local" && provider !== "dynamic") throw new HttpError(400, "bad provider");
    const prev = await getGrant(licensee);
    const grant: Grant = {
      licensee,
      provider,
      capUsdc: cap.toString(),
      spentUsdc: prev && !prev.revokedAt && prev.provider === provider ? prev.spentUsdc : "0",
      createdAt: Date.now(),
      dynamic: provider === "dynamic" ? prev?.dynamic : undefined,
    };
    await saveGrant(grant);
    return json({ grant: publicGrant(grant) }, 201);
  } catch (e) {
    return fail(e);
  }
}

/** Revoke from our side (the Dynamic share is also revoked in the browser with revokeWaasDelegation). */
export async function DELETE(req: NextRequest) {
  try {
    const { licensee: raw, auth } = (await req.json().catch(() => ({}))) as { licensee?: string; auth?: SignedAction };
    const licensee = address(raw, "licensee");
    await verifyAction(auth, "revoke delegation", licensee);
    const g = await getGrant(licensee);
    if (!g) throw new HttpError(404, "no delegation");
    g.revokedAt = Date.now();
    g.dynamic = undefined;
    await saveGrant(g);
    return json({ grant: publicGrant(g) });
  } catch (e) {
    return fail(e);
  }
}
