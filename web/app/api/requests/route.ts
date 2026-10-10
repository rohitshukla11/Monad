import type { NextRequest } from "next/server";
import { address, fail, json } from "@/lib/server/http";
import { fileRequest, listRequests } from "@/lib/server/requests";

/** File a licence request for the creator's approval (requests inside auto-approve terms go straight on chain). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return json(await fileRequest(body), 201);
  } catch (e) {
    return fail(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    return json({
      requests: await listRequests({
        creator: q.get("creator") ? address(q.get("creator"), "creator") : undefined,
        licensee: q.get("licensee") ? address(q.get("licensee"), "licensee") : undefined,
      }),
    });
  } catch (e) {
    return fail(e);
  }
}
