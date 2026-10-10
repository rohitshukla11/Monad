import type { NextRequest } from "next/server";

/** Browser-sent transaction timings, logged as one JSON line each (send → receipt, in the browser). */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { hash?: string; fn?: string; from?: string; ms?: number; gasUsed?: string };
  if (!/^0x[0-9a-f]{64}$/.test(b.hash ?? "")) return Response.json({ ok: false }, { status: 400 });
  console.log(JSON.stringify({ service: "tx", hash: b.hash, fn: String(b.fn).slice(0, 40), from: String(b.from).slice(0, 42), ms: Number(b.ms), gasUsed: String(b.gasUsed).slice(0, 20) }));
  return Response.json({ ok: true });
}
