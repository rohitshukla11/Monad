import type { NextRequest } from "next/server";
import { fileByToken } from "@/lib/server/generate";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/renders/file/[token]">) {
  const f = await fileByToken((await ctx.params).token);
  if (!f) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(new Uint8Array(f.bytes), {
    headers: { "content-type": f.mime, "content-disposition": `inline; filename="${f.name}"`, "cache-control": "private, no-store" },
  });
}
