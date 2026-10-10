import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { getBrand, isComplete, saveBrandProfile } from "@/lib/server/brands";
import { address, fail, json } from "@/lib/server/http";

/** A brand's profile (none of it is secret: name, website, email domain, badge, uses), and whether it is complete. */
export async function GET(req: NextRequest) {
  try {
    const b = await getBrand(address(req.nextUrl.searchParams.get("address")));
    if (!b) return json({ brand: null, complete: false });
    const { profileSignature: _s, policy, ...rest } = b;
    return json({ brand: { ...rest, policySigned: !!policy }, complete: isComplete(b) });
  } catch (e) {
    return fail(e);
  }
}

/** Save the company details, signed by the brand wallet ("Likeness: save brand profile"). */
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { address?: string; auth?: SignedAction; name?: string; website?: string; uses?: string[]; monthlyRenders?: string; logo?: string | null };
    const saved = await saveBrandProfile({
      address: address(b.address),
      auth: b.auth!,
      name: b.name ?? "",
      website: b.website ?? "",
      uses: Array.isArray(b.uses) ? b.uses : [],
      monthlyRenders: b.monthlyRenders ?? "",
      logo: b.logo ?? null,
    });
    return json({ badge: saved.badge, logo: saved.logo });
  } catch (e) {
    return fail(e);
  }
}
