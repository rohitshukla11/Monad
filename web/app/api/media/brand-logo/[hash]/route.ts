import type { NextRequest } from "next/server";
import { fail, HttpError } from "@/lib/server/http";
import { mediaBytes } from "@/lib/server/media";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/media/brand-logo/[hash]">) {
  try {
    const m = await mediaBytes((await ctx.params).hash);
    if (!m || m.rec.kind !== "brand-logo") throw new HttpError(404, "no such logo");
    return new Response(new Uint8Array(m.bytes), { headers: { "content-type": m.rec.mime, "cache-control": "public, max-age=3600" } });
  } catch (e) {
    return fail(e);
  }
}
