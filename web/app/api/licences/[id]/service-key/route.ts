import type { NextRequest } from "next/server";
import { fail, json, licenceId } from "@/lib/server/http";
import { serviceKey } from "@/lib/server/keyring";

/** The render service's ephemeral X25519 public key for this licence (created on first request). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/licences/[id]/service-key">) {
  try {
    return json(await serviceKey(licenceId((await ctx.params).id)));
  } catch (e) {
    return fail(e);
  }
}
