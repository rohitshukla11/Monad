import type { NextRequest } from "next/server";
import { isAddress } from "viem";
import { brandCards } from "@/lib/server/brands";
import { fail, json } from "@/lib/server/http";

/** Name, logo and badge for licensees, as creators, the verifier and receipts show them. */
export async function GET(req: NextRequest) {
  try {
    const list = (req.nextUrl.searchParams.get("addresses") ?? "").split(",").filter((a) => isAddress(a));
    return json({ brands: await brandCards(list) });
  } catch (e) {
    return fail(e);
  }
}
