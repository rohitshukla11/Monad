import type { NextRequest } from "next/server";
import type { Hex } from "viem";
import { claim, GenerateError } from "@/lib/server/generate";
import { fail, json } from "@/lib/server/http";

/** Wallet mode: the brand sent payRender itself; release the file once its receipt is on chain. */

// Chain, Didit, C2PA or model calls can outlast the default function timeout on a host like Vercel.
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: RouteContext<"/api/renders/[hash]/claim">) {
  try {
    const hash = (await ctx.params).hash;
    if (!/^0x[0-9a-f]{64}$/.test(hash)) return json({ error: "bad hash" }, 400);
    const { tx } = (await req.json().catch(() => ({}))) as { tx?: Hex };
    return json(await claim(hash as Hex, tx && /^0x[0-9a-f]{64}$/.test(tx) ? tx : undefined));
  } catch (e) {
    if (e instanceof GenerateError) return json({ error: e.message }, e.status);
    return fail(e);
  }
}
