import type { NextRequest } from "next/server";
import { address, fail, json } from "@/lib/server/http";
import { historySource } from "@/lib/server/index";
import { releaseState } from "@/lib/server/keyring";
import { listLicences, readEscrow } from "@/lib/server/protocol";

/** Licences filtered by creator and/or licensee, each with its escrow account and key-release state. */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const filter = {
      creator: q.get("creator") ? address(q.get("creator"), "creator") : undefined,
      licensee: q.get("licensee") ? address(q.get("licensee"), "licensee") : undefined,
    };
    const licences = await listLicences(filter);
    const rows = await Promise.all(licences.map(async (l) => ({ ...l, escrow: await readEscrow(l.id), release: releaseState(l.id) })));
    return json({ source: historySource(), licences: rows });
  } catch (e) {
    return fail(e);
  }
}
