import "server-only";
/**
 * Ciphertext store. The server never receives a key, a PRF output or a plaintext capture: it stores
 * opaque, schema-checked envelopes under opaque ids the browser derives.
 *
 * STORE_DRIVER picks the backend; both behave the same (write-once, envelope-only):
 *  - "local" (default): files under STORE_DIR, default web/.data/vault (git-ignored);
 *  - "blob": Vercel Blob, private access (@vercel/blob 2.8.0, https://vercel.com/docs/vercel-blob/using-blob-sdk).
 */
import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const driver = process.env.STORE_DRIVER ?? "local";
if (driver !== "local" && driver !== "blob") throw new Error(`STORE_DRIVER must be "local" or "blob", got "${driver}"`);
const useBlob = driver === "blob";
// Runtime-only path (not bundled), so tracing is skipped.
const localDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORE_DIR ?? ".data/vault");

export const VAULT_KEY = /^[A-Za-z0-9_-]{22,128}$/;
const B64U = /^[A-Za-z0-9_-]+$/;
const MAX_BYTES = 8 * 1024 * 1024;

export class StoreError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type SealedShape = { v: 1; iv: string; ct: string };
const isSealed = (x: unknown): x is SealedShape =>
  typeof x === "object" &&
  x !== null &&
  (x as SealedShape).v === 1 &&
  typeof (x as SealedShape).iv === "string" &&
  B64U.test((x as SealedShape).iv) &&
  typeof (x as SealedShape).ct === "string" &&
  B64U.test((x as SealedShape).ct) &&
  Object.keys(x).length === 3;

/**
 * Accept only envelope-shaped JSON: a single sealed blob, or a reference set (sealed items plus a
 * sealed DEK). Anything else, including any raw image upload, is rejected before it is written.
 */
export function assertCiphertext(body: unknown): void {
  if (isSealed(body)) return;
  const set = body as { v?: unknown; creator?: unknown; items?: unknown; digests?: unknown; wrappedDek?: unknown };
  const ok =
    typeof set === "object" &&
    set !== null &&
    set.v === 1 &&
    typeof set.creator === "string" &&
    /^0x[0-9a-f]{40}$/.test(set.creator) &&
    Array.isArray(set.items) &&
    set.items.length > 0 &&
    set.items.length <= 16 &&
    set.items.every(isSealed) &&
    Array.isArray(set.digests) &&
    set.digests.length === set.items.length &&
    set.digests.every((d) => typeof d === "string" && /^[0-9a-f]{64}$/.test(d)) &&
    isSealed(set.wrappedDek) &&
    Object.keys(set).length === 5;
  if (!ok) throw new StoreError(400, "body is not a sealed envelope");
}

export async function putCiphertext(key: string, raw: string): Promise<void> {
  if (!VAULT_KEY.test(key)) throw new StoreError(400, "bad key");
  if (raw.length > MAX_BYTES) throw new StoreError(413, "too large");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new StoreError(400, "not JSON");
  }
  assertCiphertext(body);

  if (useBlob) {
    try {
      // Write-once: an id cannot be overwritten, so nobody can replace someone else's ciphertext.
      await put(`vault/${key}.json`, raw, { access: "private", contentType: "application/json", allowOverwrite: false });
    } catch (e) {
      throw new StoreError(409, e instanceof Error ? e.message : "write failed");
    }
    return;
  }
  await mkdir(localDir, { recursive: true });
  try {
    await writeFile(path.join(localDir, `${key}.json`), raw, { flag: "wx" });
  } catch {
    throw new StoreError(409, "already exists");
  }
}

export async function getCiphertext(key: string): Promise<string | null> {
  if (!VAULT_KEY.test(key)) throw new StoreError(400, "bad key");
  if (useBlob) {
    const r = await get(`vault/${key}.json`, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return new Response(r.stream).text();
  }
  try {
    return await readFile(path.join(localDir, `${key}.json`), "utf8");
  } catch {
    return null;
  }
}
