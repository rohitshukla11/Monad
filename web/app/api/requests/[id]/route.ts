import type { NextRequest } from "next/server";
import type { Hex } from "viem";
import { fail, HttpError, json } from "@/lib/server/http";
import { decide, getRequest } from "@/lib/server/requests";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/requests/[id]">) {
  try {
    const r = await getRequest((await ctx.params).id);
    return r ? json(r) : json({ error: "no such request" }, 404);
  } catch (e) {
    return fail(e);
  }
}

/** The creator approves (EIP-712 Approval signature) or declines (signed message). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/requests/[id]">) {
  try {
    const id = (await ctx.params).id;
    const { approve, signature } = (await req.json().catch(() => ({}))) as { approve?: boolean; signature?: Hex };
    if (typeof approve !== "boolean" || !signature) throw new HttpError(400, "send approve and signature");
    return json(await decide(id, { approve, signature }));
  } catch (e) {
    return fail(e);
  }
}
