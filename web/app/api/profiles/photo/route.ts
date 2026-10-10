import type { NextRequest } from "next/server";
import type { SignedAction } from "@/lib/auth";
import type { ReferenceSet } from "@/lib/crypto/envelope";
import { address, fail, HttpError, json } from "@/lib/server/http";
import { removePublicPhoto, setPublicPhoto, setPublicPhotoFromSample } from "@/lib/server/profiles";

// Face matching may first fetch the matcher's model on a cold server.
export const maxDuration = 300;

/**
 * Set the public photo: the candidate photo, one of the creator's attested reference photos (both
 * base64) and the sealed reference set it belongs to; or { fromSample } to use one of the creator's
 * approved samples (AI-generated, labelled so). Or remove it: { remove: true }.
 */
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { address?: string; auth?: SignedAction; remove?: boolean; set?: ReferenceSet; reference?: string; photo?: string; fromSample?: string };
    const who = address(b.address);
    if (b.remove) return json(await removePublicPhoto(who, b.auth!));
    if (b.fromSample) {
      if (!b.set || !b.reference) throw new HttpError(400, "send a reference photo and the reference set");
      return json(await setPublicPhotoFromSample({ address: who, auth: b.auth!, sampleId: b.fromSample, set: b.set, reference: new Uint8Array(Buffer.from(b.reference, "base64")) }));
    }
    if (!b.set || !b.reference || !b.photo) throw new HttpError(400, "send the photo, a reference photo and the reference set");
    return json(
      await setPublicPhoto({ address: who, auth: b.auth!, set: b.set, reference: new Uint8Array(Buffer.from(b.reference, "base64")), photo: new Uint8Array(Buffer.from(b.photo, "base64")) }),
    );
  } catch (e) {
    return fail(e);
  }
}
