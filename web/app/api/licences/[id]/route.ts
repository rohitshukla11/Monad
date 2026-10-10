import type { NextRequest } from "next/server";
import { fail, json, licenceId } from "@/lib/server/http";
import { history } from "@/lib/server/index";
import { releaseState } from "@/lib/server/keyring";
import { readCreator, readEscrow, readLicence, revokedAt } from "@/lib/server/protocol";
import { getBrief } from "@/lib/server/requests";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/licences/[id]">) {
  try {
    const id = licenceId((await ctx.params).id);
    const l = await readLicence(id);
    if (!l) return json({ error: "no such licence" }, 404);
    const h = await history();
    const issued = h.licences.find((r) => r.id === id.toString());
    return json({
      licence: l,
      creator: await readCreator(l.creator),
      escrow: await readEscrow(id),
      brief: await getBrief(l.purposeHash),
      issued: issued ? { tx: issued.tx, timestamp: issued.timestamp, autoApproved: issued.autoApproved } : null,
      renders: h.renders.filter((r) => r.licenceId === id.toString()),
      deposits: h.deposits.filter((r) => r.licenceId === id.toString()),
      refunds: h.refunds.filter((r) => r.licenceId === id.toString()),
      revoked: l.status === "Revoked" ? await revokedAt(l) : null,
      release: releaseState(id),
      source: h.source,
    });
  } catch (e) {
    return fail(e);
  }
}
