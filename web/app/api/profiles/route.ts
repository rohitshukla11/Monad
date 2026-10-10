import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import { fail, json } from "@/lib/server/http";
import { publicProfiles } from "@/lib/server/profiles";

/** Public profile (photo URL, tags, listed, sample count) for up to 50 creators. */
export async function GET(req: NextRequest) {
  try {
    const list = (req.nextUrl.searchParams.get("addresses") ?? "").split(",").filter((a) => isAddress(a));
    return json({ profiles: await publicProfiles(list) });
  } catch (e) {
    return fail(e);
  }
}
