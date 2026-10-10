import type { NextRequest } from "next/server";
import { fail, HttpError } from "@/lib/server/http";
import { mediaBytes } from "@/lib/server/media";
import { readToken } from "@/lib/server/tokens";

/** A sample render behind a short-lived signed URL. Checked against the index on every request. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/media/[token]">) {
  try {
    const t = readToken<{ h: string; p: number; v: string }>("media", (await ctx.params).token);
    if (!t) throw new HttpError(403, "this link has expired or is not valid");
    const m = await mediaBytes(t.h, t.p === 1);
    if (!m) throw new HttpError(404, "no longer available");
    return new Response(new Uint8Array(m.bytes), { headers: { "content-type": m.rec.mime, "cache-control": "private, no-store", "x-robots-tag": "noindex" } });
  } catch (e) {
    return fail(e);
  }
}
