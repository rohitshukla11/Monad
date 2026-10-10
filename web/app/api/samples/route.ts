import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import type { ReferenceSet } from "@/lib/crypto/envelope";
import type { SampleRelease } from "@/lib/crypto/release";
import { address, fail, HttpError, json } from "@/lib/server/http";
import { createSamples, samplesForBrand } from "@/lib/server/samples";
import { readToken } from "@/lib/server/tokens";

// Up to four renders in one request, plus a possible cold start.
export const maxDuration = 300;

/** Published samples of one creator, for a signed-in brand only (x-likeness-brand session header). */
export async function GET(req: NextRequest) {
  try {
    const creator = address(req.nextUrl.searchParams.get("creator"), "creator");
    const session = readToken<{ b: string }>("brand-session", req.headers.get("x-likeness-brand"));
    if (!session) throw new HttpError(401, "sign in as a brand with a completed profile to see sample renders");
    return json({ samples: await samplesForBrand(creator, session.b) });
  } catch (e) {
    return fail(e);
  }
}

/** Create sample renders (pending until the creator approves each one). */
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { creator?: string; auth?: SignedAction; release?: SampleRelease; set?: ReferenceSet; prompts?: { scene: string; prompt: string }[] };
    if (!b.release || !b.set || !Array.isArray(b.prompts)) throw new HttpError(400, "send the release, the reference set and the prompts");
    return json({ samples: await createSamples({ creator: address(b.creator, "creator"), auth: b.auth!, release: b.release, set: b.set, prompts: b.prompts }) });
  } catch (e) {
    return fail(e);
  }
}
