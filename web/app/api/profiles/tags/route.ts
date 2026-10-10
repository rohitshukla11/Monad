import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import type { StyleTags } from "@/lib/creator-profile";
import { address, fail, json } from "@/lib/server/http";
import { setTags } from "@/lib/server/profiles";

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { address?: string; auth?: SignedAction; tags?: Partial<StyleTags> };
    return json(await setTags(address(b.address), b.auth!, b.tags ?? {}));
  } catch (e) {
    return fail(e);
  }
}
