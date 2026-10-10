import type { NextRequest } from "next/server";
import { drip } from "@/lib/server/drip";

export async function POST(req: NextRequest) {
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const r = await drip(address ?? "", ip);
  return Response.json(r.body, { status: r.status });
}
