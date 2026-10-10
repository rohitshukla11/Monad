import type { NextRequest } from "next/server";
import { refreshIdentity, verificationLevel } from "@/lib/server/didit";
import { address, fail, json } from "@/lib/server/http";

/** Our verdict on this wallet's Didit session, re-read from Didit's decision endpoint while pending. */
export async function GET(req: NextRequest) {
  try {
    const who = address(req.nextUrl.searchParams.get("address"));
    const i = await refreshIdentity(who);
    if (!i) return json({ state: "none", level: verificationLevel() });
    // A verification at another level than the server's current one does not count.
    if (i.level !== verificationLevel()) return json({ state: "none", level: verificationLevel(), previous: { level: i.level, state: i.state } });
    return json({ state: i.state, level: i.level, sessionStatus: i.sessionStatus, reasons: i.reasons, environment: i.environment, checks: i.checks ?? null });
  } catch (e) {
    return fail(e);
  }
}
