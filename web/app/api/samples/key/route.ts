import { fail, json } from "@/lib/server/http";
import { samplePublicKey } from "@/lib/server/samples";

/** The render service's sample key (X25519 public key, base64url): the creator's browser wraps a one-request release to it. */
export async function GET() {
  try {
    return json({ publicKey: samplePublicKey() });
  } catch (e) {
    return fail(e);
  }
}
