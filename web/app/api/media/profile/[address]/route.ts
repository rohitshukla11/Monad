import type { NextRequest } from "next/server";
import { address, fail, HttpError } from "@/lib/server/http";
import { mediaBytes } from "@/lib/server/media";
import { getProfile } from "@/lib/server/profiles";

/** A creator's public photo (512 px, watermarked). Not cached, so a removal takes effect at once. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/media/profile/[address]">) {
  try {
    const p = await getProfile(address((await ctx.params).address));
    const m = p?.photo ? await mediaBytes(p.photo.sha256) : null;
    if (!m) throw new HttpError(404, "no public photo");
    return new Response(new Uint8Array(m.bytes), { headers: { "content-type": m.rec.mime, "cache-control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}
