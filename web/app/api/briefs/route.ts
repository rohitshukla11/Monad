import type { NextRequest } from "next/server";
import { fail, json } from "@/lib/server/http";
import { saveBrief } from "@/lib/server/requests";

/** Store a licence brief; returns the purposeHash to put on chain. */
export async function POST(req: NextRequest) {
  try {
    return json({ purposeHash: await saveBrief(await req.json()) }, 201);
  } catch (e) {
    return fail(e);
  }
}
