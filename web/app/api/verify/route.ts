import type { NextRequest } from "next/server";
import type { Hex } from "viem";
import { fail, HttpError, json } from "@/lib/server/http";
import { verifyFile, verifyHash } from "@/lib/server/verify";

const MAX = 25 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Upload a file (multipart field "file"): C2PA + receipt lookup. The file is not stored. */

// Chain, Didit, C2PA or model calls can outlast the default function timeout on a host like Vercel.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "send the image as multipart field 'file'");
    if (file.size > MAX) throw new HttpError(413, "file too large (25 MB max)");
    const mime = TYPES.has(file.type) ? file.type : file.name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return json(await verifyFile(new Uint8Array(await file.arrayBuffer()), mime));
  } catch (e) {
    return fail(e);
  }
}

/** Fallback: look up a sha256 asset hash directly (receipt only, no manifest). */
export async function GET(req: NextRequest) {
  try {
    const hash = req.nextUrl.searchParams.get("hash")?.toLowerCase() ?? "";
    if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new HttpError(400, "hash must be 0x + 64 hex characters (sha256 of the file)");
    return json(await verifyHash(hash as Hex));
  } catch (e) {
    return fail(e);
  }
}
