import type { NextRequest } from "next/server";
import { getCiphertext, putCiphertext, StoreError } from "@/lib/server/store";

const fail = (e: unknown) =>
  e instanceof StoreError ? Response.json({ error: e.message }, { status: e.status }) : Response.json({ error: "store error" }, { status: 500 });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/vault/[key]">) {
  try {
    const body = await getCiphertext((await ctx.params).key);
    if (body === null) return Response.json({ error: "not found" }, { status: 404 });
    return new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/vault/[key]">) {
  try {
    await putCiphertext((await ctx.params).key, await req.text());
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
