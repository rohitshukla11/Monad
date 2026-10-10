import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { verifyAction } from "@/lib/server/auth";
import { publicRecord, rendersFor } from "@/lib/server/generate";
import { address, fail, json } from "@/lib/server/http";

/** Renders for a brand or a licence, without download links. */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const rows = await rendersFor({ licensee: q.get("licensee") ? address(q.get("licensee"), "licensee") : undefined, licenceId: q.get("licence") ?? undefined });
    return json({ renders: rows.map((r) => publicRecord(r, false)) });
  } catch (e) {
    return fail(e);
  }
}

/** The brand's own renders with download links: signed "Likeness: list renders". */
export async function POST(req: NextRequest) {
  try {
    const { licensee: raw, auth } = (await req.json().catch(() => ({}))) as { licensee?: string; auth?: SignedAction };
    const licensee = address(raw, "licensee");
    await verifyAction(auth, "list renders", licensee);
    return json({ renders: (await rendersFor({ licensee })).map((r) => publicRecord(r, true)) });
  } catch (e) {
    return fail(e);
  }
}
