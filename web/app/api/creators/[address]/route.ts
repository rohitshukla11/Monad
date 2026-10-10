import type { NextRequest } from "next/server";
import { address, fail, json } from "@/lib/server/http";
import { listLicences, readCreatorWithHistory } from "@/lib/server/protocol";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/creators/[address]">) {
  try {
    const a = address((await ctx.params).address);
    const creator = await readCreatorWithHistory(a);
    if (!creator) return json({ error: "not a registered creator" }, 404);
    return json({ creator, licences: await listLicences({ creator: a }) });
  } catch (e) {
    return fail(e);
  }
}
