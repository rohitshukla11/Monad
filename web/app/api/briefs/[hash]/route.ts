import type { NextRequest } from "next/server";
import type { Hex } from "viem";
import { fail, json } from "@/lib/server/http";
import { getBrief } from "@/lib/server/requests";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/briefs/[hash]">) {
  try {
    const h = (await ctx.params).hash;
    if (!/^0x[0-9a-f]{64}$/.test(h)) return json({ error: "bad hash" }, 400);
    const b = await getBrief(h as Hex);
    return b ? json(b) : json({ error: "no brief stored for this hash" }, 404);
  } catch (e) {
    return fail(e);
  }
}
