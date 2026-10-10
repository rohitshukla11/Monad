import type { NextRequest } from "next/server";
import type { Release } from "@/lib/crypto/release";
import { fail, HttpError, json, licenceId } from "@/lib/server/http";
import { acceptLicenceRelease } from "@/lib/server/keyring";
import { VAULT_KEY } from "@/lib/server/store";

/**
 * The creator's browser posts the reference-set data key, re-wrapped to this licence's service key.
 * No session needed: the release only verifies if it opens the creator's attested reference set.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/licences/[id]/release">) {
  try {
    const id = licenceId((await ctx.params).id);
    const { release, vaultKey } = (await req.json().catch(() => ({}))) as { release?: Release; vaultKey?: string };
    if (!release || release.v !== 1 || typeof release.epk !== "string" || !release.sealed) throw new HttpError(400, "bad release");
    if (!vaultKey || !VAULT_KEY.test(vaultKey)) throw new HttpError(400, "bad vault key");
    return json(await acceptLicenceRelease(id, release, vaultKey));
  } catch (e) {
    return fail(e);
  }
}
