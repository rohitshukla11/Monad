import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { signBrandPolicy } from "@/lib/server/brands";
import { address, fail, json } from "@/lib/server/http";

/** The brand signs the policy's version and sha256 with its wallet. */
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { address?: string; auth?: SignedAction };
    const saved = await signBrandPolicy(address(b.address), b.auth!);
    return json({ policy: { version: saved.policy!.version, at: saved.policy!.at } });
  } catch (e) {
    return fail(e);
  }
}
