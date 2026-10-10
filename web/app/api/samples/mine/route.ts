import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { address, fail, json } from "@/lib/server/http";
import { mySamples } from "@/lib/server/samples";

/** The creator's own samples, pending and published, after a wallet signature. */
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { creator?: string; auth?: SignedAction };
    return json({ samples: await mySamples(address(b.creator, "creator"), b.auth!) });
  } catch (e) {
    return fail(e);
  }
}
