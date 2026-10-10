import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { address, fail, HttpError, json } from "@/lib/server/http";
import { decideSample } from "@/lib/server/samples";

/** Approve (publish), reject (delete) or remove (take down) a sample. */
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { creator?: string; auth?: SignedAction; id?: string; decision?: string };
    if (b.decision !== "approve" && b.decision !== "reject" && b.decision !== "remove") throw new HttpError(400, "decision must be approve, reject or remove");
    return json(await decideSample(address(b.creator, "creator"), b.auth!, String(b.id ?? ""), b.decision));
  } catch (e) {
    return fail(e);
  }
}
