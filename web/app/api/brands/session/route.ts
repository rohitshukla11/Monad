import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { startBrandSession } from "@/lib/server/brands";
import { address, fail, json } from "@/lib/server/http";

/** A short brand session for viewing sample renders, after a wallet signature; complete profiles only. */
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { address?: string; auth?: SignedAction };
    return json(await startBrandSession(address(b.address), b.auth!));
  } catch (e) {
    return fail(e);
  }
}
