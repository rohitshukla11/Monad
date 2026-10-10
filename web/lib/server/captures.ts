import "server-only";
/**
 * The guided reference photos, each checked against the creator's Didit liveness selfie:
 *  - VERIFICATION_LEVEL=full: Didit's 1:1 face match (save_api_request=false, so Didit stores nothing);
 *  - VERIFICATION_LEVEL=free: our local matcher (lib/server/facematch), on this server, in memory.
 * The matcher used is the one for the level the creator's Didit session ran at. On success only the
 * sha256 digests of the captures (with the scores and the Didit session reference, never an image) are
 * kept, in the app's record store, until the attestation is signed or the record expires after 30
 * minutes; the attester signs only a reference set whose plaintext digests equal these. The store, not
 * memory, so a later request on another server instance (Vercel) still finds the record.
 */
import { createHash } from "node:crypto";
import type { Address } from "viem";
import { dbDelete, dbGet, dbPut } from "./db";
import { faceMatch, getIdentity, livenessSelfie } from "./didit";
import { compareFaces, FaceMatchError, localThreshold } from "./facematch";

const RECORD_TTL = 30 * 60_000;
const threshold = () => Number(process.env.DIDIT_CAPTURE_MATCH_THRESHOLD ?? 60);

type Passed = { address: string; sessionId: string; digests: string[]; scores: number[]; matcher: "didit" | "local"; at: number };
const COLLECTION = "captures-passed";

export class CaptureError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function verifyCaptures(address: Address, captures: Uint8Array[]) {
  const who = address.toLowerCase();
  if (captures.length !== 3) throw new CaptureError(400, "send exactly 3 captures");
  const identity = await getIdentity(who);
  if (identity?.state !== "approved" || !identity.checks?.adult) throw new CaptureError(409, "finish the Didit verification first");

  let selfie: Uint8Array | undefined;
  const scores: number[] = [];
  try {
    selfie = await livenessSelfie(identity.sessionId);
    for (const [i, c] of captures.entries()) {
      if (identity.level === "full") {
        const m = await faceMatch(c, selfie, threshold());
        if (m.status !== "Approved") throw new CaptureError(422, `photo ${i + 1} does not match your liveness selfie (${m.status}${m.score !== null ? `, score ${m.score.toFixed(1)}` : ""})`);
        scores.push(m.score ?? 0);
      } else {
        let sim: number;
        try {
          sim = await compareFaces(new Uint8Array(c), new Uint8Array(selfie));
        } catch (e) {
          throw new CaptureError(e instanceof FaceMatchError ? e.status : 500, `photo ${i + 1}: ${(e as Error).message}`);
        }
        if (sim < localThreshold()) throw new CaptureError(422, `photo ${i + 1} does not match your liveness selfie (local similarity ${sim.toFixed(2)} < ${localThreshold()})`);
        scores.push(Math.round(sim * 100));
      }
    }
  } finally {
    selfie?.fill(0);
  }
  const digests = captures.map((c) => createHash("sha256").update(c).digest("hex"));
  const matcher = identity.level === "full" ? "didit" : "local";
  await dbPut<Passed>(COLLECTION, who, { address: who, sessionId: identity.sessionId, digests, scores, matcher, at: Date.now() });
  return { scores, digests, matcher };
}

export async function peekPassed(address: string): Promise<Passed | undefined> {
  const p = await dbGet<Passed>(COLLECTION, address.toLowerCase());
  return p && Date.now() - p.at <= RECORD_TTL ? p : undefined;
}

/** The record the attester relies on; consumed once. */
export async function takePassed(address: string): Promise<Passed | undefined> {
  const p = await peekPassed(address);
  await dbDelete(COLLECTION, address.toLowerCase());
  return p;
}
