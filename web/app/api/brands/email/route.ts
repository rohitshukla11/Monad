import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { confirmEmailCode, emailProof, mailer, proveEmailWithDynamic, sendEmailCode } from "@/lib/server/brands";
import { address, fail, HttpError, json } from "@/lib/server/http";

/** The current email proof and whether email codes can be sent here. */
export async function GET(req: NextRequest) {
  try {
    const p = await emailProof(address(req.nextUrl.searchParams.get("address")));
    return json({ proof: p ? { emailDomain: p.emailDomain, method: p.method } : null, codes: mailer() !== null });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Prove a work email: "dynamic" (the sign-in email, from Dynamic's signed session token), or "send"
 * then "confirm" (a 6-digit code to the work email; needs an email provider on the server).
 */
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { address?: string; step?: string; token?: string; email?: string; code?: string; auth?: SignedAction };
    const who = address(b.address);
    if (b.step === "dynamic") return json(await proveEmailWithDynamic(who, b.token ?? ""));
    if (b.step === "send") return json(await sendEmailCode(who, b.auth!, b.email ?? ""));
    if (b.step === "confirm") return json(await confirmEmailCode(who, b.code ?? ""));
    throw new HttpError(400, "unknown step");
  } catch (e) {
    return fail(e);
  }
}
