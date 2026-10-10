import "server-only";
/**
 * Public previews: creators' profile photos, sample renders and brand logos. These never touch the
 * encrypted reference sets (lib/server/store.ts). Every image here is re-encoded (which drops all
 * metadata), resized, watermarked and given a C2PA manifest before it is kept, and indexed by its
 * sha256 so the verifier can say what it is. Removal deletes the file, marks the index entry removed
 * and is logged; serving checks the index every time, so a removal takes effect at once.
 */
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { requireAddress } from "@/lib/deployment";
import { embedPreviewManifest } from "./c2pa";
import { dbGet, dbPut } from "./db";
import { fileDelete, fileGet, filePut, localDir } from "./files";
import { WATERMARK_PROFILE, WATERMARK_SAMPLE } from "./watermarks";

export type MediaKind = "profile-photo" | "sample-render" | "brand-logo";

export type MediaRecord = {
  sha256: string;
  kind: MediaKind;
  /** The creator (or brand, for a logo) it belongs to. */
  owner: string;
  /** Storage key, under media/ in the file store. */
  file: string;
  mime: "image/jpeg" | "image/png";
  /** "pending": a sample the creator has not approved yet (never public). */
  status: "pending" | "live" | "removed";
  createdAt: number;
  removedAt?: number;
  /** For samples: the sample id. */
  ref?: string;
};

const mediaDir = () => localDir("MEDIA_DIR", "media");
const paths = (file: string) => [`media/${file}`, path.join(/*turbopackIgnore: true*/ mediaDir(), file)] as const;
export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Resize to fit `edge`, drop metadata, add the visible watermark bottom-right; JPEG out. */
export async function watermarked(bytes: Uint8Array, edge: number, kind: "profile-photo" | "sample-render"): Promise<Buffer> {
  const base = sharp(bytes, { failOn: "error" }).rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
  const { data, info } = await base.jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
  const markWidth = Math.max(160, Math.round(info.width * 0.62));
  const mark = await sharp(kind === "profile-photo" ? WATERMARK_PROFILE : WATERMARK_SAMPLE).resize({ width: Math.min(markWidth, info.width - 16) }).png().toBuffer();
  const meta = await sharp(mark).metadata();
  const margin = Math.max(8, Math.round(info.width * 0.025));
  return sharp(data)
    .composite([{ input: mark, left: info.width - (meta.width ?? 0) - margin, top: info.height - (meta.height ?? 0) - margin }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

/** Watermark, sign (C2PA) and keep a preview. Returns its index record. */
export async function publishPreview(input: {
  bytes: Uint8Array;
  kind: "profile-photo" | "sample-render";
  owner: string;
  edge: number;
  status: "pending" | "live";
  ref?: string;
  model?: string;
}): Promise<MediaRecord> {
  const marked = await watermarked(input.bytes, input.edge, input.kind);
  const signed = embedPreviewManifest(
    marked,
    "image/jpeg",
    { kind: input.kind, creator: input.owner.toLowerCase(), creatorRegistry: requireAddress("CreatorRegistry"), createdAt: new Date().toISOString() },
    input.model,
  );
  const hash = sha256(signed);
  const file = `${input.kind}/${hash}.jpg`;
  await filePut(...paths(file), signed, { contentType: "image/jpeg", overwrite: true });
  const rec: MediaRecord = { sha256: hash, kind: input.kind, owner: input.owner.toLowerCase(), file, mime: "image/jpeg", status: input.status, createdAt: Date.now(), ref: input.ref };
  await dbPut("media", hash, rec);
  return rec;
}

/** A brand logo: square, at most 256 px, PNG, metadata dropped. Not watermarked (it is the brand's own mark). */
export async function publishLogo(bytes: Uint8Array, brand: string): Promise<MediaRecord> {
  const png = await sharp(bytes, { failOn: "error" }).rotate().resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const hash = sha256(png);
  const file = `brand-logo/${hash}.png`;
  await filePut(...paths(file), png, { contentType: "image/png", overwrite: true });
  const rec: MediaRecord = { sha256: hash, kind: "brand-logo", owner: brand.toLowerCase(), file, mime: "image/png", status: "live", createdAt: Date.now() };
  await dbPut("media", hash, rec);
  return rec;
}

export const mediaRecord = (hash: string) => (/^[0-9a-f]{64}$/.test(hash) ? dbGet<MediaRecord>("media", hash) : Promise.resolve(null));

export async function setMediaStatus(hash: string, status: MediaRecord["status"]) {
  const rec = await mediaRecord(hash);
  if (!rec) return null;
  const next = { ...rec, status, ...(status === "removed" ? { removedAt: Date.now() } : {}) };
  await dbPut("media", hash, next);
  return next;
}

/** Take a preview down everywhere: mark it removed (the verifier still knows what it was), delete the file, log it. */
export async function removeMedia(hash: string, by: string, reason: string) {
  const rec = await mediaRecord(hash);
  if (!rec || rec.status === "removed") return;
  await setMediaStatus(hash, "removed");
  await fileDelete(...paths(rec.file));
  await logMedia({ action: "removed", sha256: hash, kind: rec.kind, owner: rec.owner, by: by.toLowerCase(), reason });
}

/** The bytes of a preview that is still allowed to be served (pending only when the caller allows it). */
export async function mediaBytes(hash: string, allowPending = false): Promise<{ bytes: Buffer; rec: MediaRecord } | null> {
  const rec = await mediaRecord(hash);
  if (!rec || rec.status === "removed" || (rec.status === "pending" && !allowPending)) return null;
  const bytes = await fileGet(...paths(rec.file));
  return bytes ? { bytes, rec } : null;
}

export async function logMedia(entry: Record<string, string>) {
  const at = Date.now();
  await dbPut("media-log", `${at}-${randomBytes(4).toString("hex")}`, { ...entry, at });
}
