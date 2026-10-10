import "server-only";
/**
 * Creator public profiles: the public photo, style tags and the marketplace listing switch, kept
 * off-chain and signed by the creator's wallet.
 *
 * The public photo must be the attested face. Didit's liveness selfie is deleted once a creator is
 * attested, so the reference is one of the creator's own attested reference photos: the browser sends
 * it decrypted with the sealed reference set; the server checks that the set is the one whose hash is
 * on chain and that this photo's sha256 is one of its digests, then face-matches the public photo
 * against it (locally, or with Didit 1:1 at VERIFICATION_LEVEL=full). The reference photo and the
 * candidate are only held in memory for the check and zeroed after.
 */
import type { Address } from "viem";
import { cleanTags, EMPTY_TAGS, type PublicProfile, type StyleTags } from "@/lib/creator-profile";
import { referenceSetHash, type ReferenceSet } from "@/lib/crypto/envelope";
import type { SignedAction } from "@/lib/auth";
import { verifyAction } from "./auth";
import { dbGet, dbPut } from "./db";
import { faceMatch, verificationLevel } from "./didit";
import { compareFaces, FaceMatchError, localThreshold } from "./facematch";
import { HttpError } from "./http";
import { logMedia, publishPreview, removeMedia, sha256 } from "./media";
import { readCreator } from "./protocol";
import { assertCiphertext } from "./store";

export type CreatorProfile = {
  address: string;
  photo: { sha256: string; sourceSha256: string; at: number; signature: SignedAction; ai?: boolean; fromSample?: string } | null;
  tags: StyleTags;
  listed: boolean;
  tagsSignature?: SignedAction;
  listingSignature?: SignedAction;
  updatedAt: number;
};

const key = (a: string) => a.toLowerCase();
export const getProfile = async (address: string): Promise<CreatorProfile | null> => dbGet<CreatorProfile>("creator-profiles", key(address));
const save = (p: CreatorProfile) => dbPut("creator-profiles", key(p.address), { ...p, updatedAt: Date.now() });
const empty = (address: string): CreatorProfile => ({ address: key(address), photo: null, tags: EMPTY_TAGS, listed: true, updatedAt: Date.now() });

export const photoUrl = (address: string, hash: string) => `/api/media/profile/${key(address)}?v=${hash.slice(0, 12)}`;

export async function publicProfile(address: string): Promise<PublicProfile> {
  const p = await getProfile(address);
  const { countPublished } = await import("./samples");
  return {
    address: key(address),
    photo: p?.photo ? photoUrl(address, p.photo.sha256) : null,
    photoAi: !!p?.photo?.ai,
    tags: p?.tags ?? EMPTY_TAGS,
    listed: !!p?.photo && (p?.listed ?? true),
    samples: await countPublished(address),
  };
}

export async function publicProfiles(addresses: string[]): Promise<Record<string, PublicProfile>> {
  const unique = [...new Set(addresses.map(key))].slice(0, 50);
  const out = await Promise.all(unique.map((a) => publicProfile(a)));
  return Object.fromEntries(out.map((p) => [p.address, p]));
}

async function matches(candidate: Uint8Array, reference: Uint8Array): Promise<{ ok: boolean; detail: string }> {
  if (verificationLevel() === "full") {
    const m = await faceMatch(candidate, reference, Number(process.env.DIDIT_CAPTURE_MATCH_THRESHOLD ?? 60));
    return { ok: m.status === "Approved", detail: `Didit 1:1 ${m.status}${m.score !== null ? `, score ${m.score.toFixed(1)}` : ""}` };
  }
  try {
    const sim = await compareFaces(new Uint8Array(candidate), new Uint8Array(reference));
    return { ok: sim >= localThreshold(), detail: `local similarity ${sim.toFixed(2)} (needs ${localThreshold()})` };
  } catch (e) {
    if (e instanceof FaceMatchError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/** Set (or change) the public photo. `photo` and `reference` are JPEG/PNG bytes. */
export async function setPublicPhoto(input: { address: Address; auth: SignedAction; set: ReferenceSet; reference: Uint8Array; photo: Uint8Array }) {
  const who = key(input.address);
  const photoSha = sha256(input.photo);
  const fields = await verifyAction(input.auth, "set public photo", input.address);
  if (fields.wallet !== who || fields["photo sha256"] !== photoSha) throw new HttpError(401, "signature is for another photo");
  if (input.photo.length > 8 * 1024 * 1024) throw new HttpError(413, "photo too large");

  const creator = await readCreator(input.address);
  if (!creator) throw new HttpError(409, "not a registered creator");
  assertCiphertext(input.set);
  if (input.set.creator !== who) throw new HttpError(422, "reference set belongs to another creator");
  if ((await referenceSetHash(input.set)) !== creator.referenceSetHash) throw new HttpError(422, "reference set is not the one attested on chain");
  if (!input.set.digests.includes(sha256(input.reference))) throw new HttpError(422, "the reference photo is not one of your attested photos");

  try {
    const m = await matches(input.photo, input.reference);
    if (!m.ok) {
      await logMedia({ action: "refused", kind: "profile-photo", owner: who, by: who, reason: `face does not match the attested face (${m.detail})` });
      throw new HttpError(422, `this photo doesn't match your verified face (${m.detail})`);
    }
    const rec = await publishPreview({ bytes: input.photo, kind: "profile-photo", owner: who, edge: 512, status: "live" });
    const prev = (await getProfile(who)) ?? empty(who);
    if (prev.photo && prev.photo.sha256 !== rec.sha256) await removeMedia(prev.photo.sha256, who, "replaced by a new public photo");
    await save({ ...prev, photo: { sha256: rec.sha256, sourceSha256: photoSha, at: Date.now(), signature: input.auth } });
    await logMedia({ action: "published", sha256: rec.sha256, kind: "profile-photo", owner: who, by: who, reason: m.detail });
    return { photo: photoUrl(who, rec.sha256), sha256: rec.sha256 };
  } finally {
    input.reference.fill(0);
    input.photo.fill(0);
  }
}

/**
 * Use one of the creator's own approved sample renders as the public photo. It is AI-generated, so it is
 * labelled so in its watermark and C2PA manifest and on every card; it must still face-match one of the
 * creator's attested reference photos (sent decrypted with the sealed set, checked as above).
 */
export async function setPublicPhotoFromSample(input: { address: Address; auth: SignedAction; sampleId: string; set: ReferenceSet; reference: Uint8Array }) {
  const who = key(input.address);
  const fields = await verifyAction(input.auth, "set public photo from sample", input.address);
  if (fields.wallet !== who || fields.sample !== input.sampleId) throw new HttpError(401, "signature is for another sample");

  const creator = await readCreator(input.address);
  if (!creator) throw new HttpError(409, "not a registered creator");
  assertCiphertext(input.set);
  if (input.set.creator !== who) throw new HttpError(422, "reference set belongs to another creator");
  if ((await referenceSetHash(input.set)) !== creator.referenceSetHash) throw new HttpError(422, "reference set is not the one attested on chain");
  if (!input.set.digests.includes(sha256(input.reference))) throw new HttpError(422, "the reference photo is not one of your attested photos");

  const { publishedSample } = await import("./samples");
  const sample = await publishedSample(who, input.sampleId);
  if (!sample) throw new HttpError(404, "only one of your approved samples can be used");
  const { mediaBytes } = await import("./media");
  const m = await mediaBytes(sample.sha256);
  if (!m) throw new HttpError(404, "that sample is no longer available");
  const candidate = new Uint8Array(m.bytes);

  try {
    const match = await matches(candidate, input.reference);
    if (!match.ok) {
      await logMedia({ action: "refused", kind: "profile-photo", owner: who, by: who, reason: `sample ${input.sampleId} does not match the attested face (${match.detail})` });
      throw new HttpError(422, `this sample doesn't look enough like your verified face to be your public photo (${match.detail}). Pick another, or use a real photo.`);
    }
    // The sample's own "Sample · not licensed" mark sits in the bottom band: crop it off, then re-mark as AI-generated.
    const rec = await publishPreview({ bytes: candidate, kind: "profile-photo", owner: who, edge: 512, status: "live", ai: true, cropBottom: 0.12, model: sample.model });
    const prev = (await getProfile(who)) ?? empty(who);
    if (prev.photo && prev.photo.sha256 !== rec.sha256) await removeMedia(prev.photo.sha256, who, "replaced by a new public photo");
    await save({ ...prev, photo: { sha256: rec.sha256, sourceSha256: sample.sha256, at: Date.now(), signature: input.auth, ai: true, fromSample: input.sampleId } });
    await logMedia({ action: "published", sha256: rec.sha256, kind: "profile-photo", owner: who, by: who, reason: `AI-generated, from sample ${input.sampleId}; ${match.detail}` });
    return { photo: photoUrl(who, rec.sha256), sha256: rec.sha256, ai: true };
  } finally {
    input.reference.fill(0);
    candidate.fill(0);
  }
}

export async function removePublicPhoto(address: Address, auth: SignedAction) {
  const who = key(address);
  const fields = await verifyAction(auth, "remove public photo", address);
  if (fields.wallet !== who) throw new HttpError(401, "signature is for another wallet");
  const p = await getProfile(who);
  if (!p?.photo) return { removed: false };
  await removeMedia(p.photo.sha256, who, "removed by the creator");
  await save({ ...p, photo: null });
  return { removed: true };
}

export async function setTags(address: Address, auth: SignedAction, tags: Partial<StyleTags>) {
  const who = key(address);
  const clean = cleanTags(tags);
  const fields = await verifyAction(auth, "set style tags", address);
  const want = { wallet: who, tone: clean.tone.join("|") || "none", setting: clean.setting.join("|") || "none", "age range": clean.ageRange ?? "none" };
  if (Object.entries(want).some(([k, v]) => fields[k] !== v)) throw new HttpError(401, "signature does not match these tags");
  const p = (await getProfile(who)) ?? empty(who);
  await save({ ...p, tags: clean, tagsSignature: auth });
  return { tags: clean };
}

export async function setListed(address: Address, auth: SignedAction, listed: boolean) {
  const who = key(address);
  const fields = await verifyAction(auth, "set marketplace listing", address);
  if (fields.wallet !== who || fields.listed !== String(listed)) throw new HttpError(401, "signature does not match this setting");
  const p = (await getProfile(who)) ?? empty(who);
  await save({ ...p, listed, listingSignature: auth });
  await logMedia({ action: listed ? "listed" : "unlisted", kind: "profile", owner: who, by: who, reason: "creator setting" });
  return { listed };
}
