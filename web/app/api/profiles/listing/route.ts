import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import { address, fail, json } from "@/lib/server/http";
import { setListed } from "@/lib/server/profiles";

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { address?: string; auth?: SignedAction; listed?: boolean };
    return json(await setListed(address(b.address), b.auth!, b.listed === true));
  } catch (e) {
    return fail(e);
  }
}
