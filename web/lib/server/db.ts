import "server-only";
/**
 * Small document store for off-chain app records that are not biometric and not secret: pending
 * licence requests and approvals, purpose briefs, delegation grants, render records. (Ciphertext goes
 * to the separate write-once vault in ./store.ts; that one refuses anything that isn't an envelope.)
 *
 * Same STORE_DRIVER switch as the vault: "local" writes JSON files under DB_DIR (default .data/db,
 * git-ignored); "blob" writes private Vercel Blob objects under db/.
 */
import { get, list, put } from "@vercel/blob";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const useBlob = (process.env.STORE_DRIVER ?? "local") === "blob";
const ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const COLLECTION = /^[a-z-]{1,32}$/;

function dir(collection: string) {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DB_DIR ?? ".data/db", collection);
}

function check(collection: string, id?: string) {
  if (!COLLECTION.test(collection)) throw new Error(`bad collection ${collection}`);
  if (id !== undefined && !ID.test(id)) throw new Error(`bad id ${id}`);
}

export async function dbGet<T>(collection: string, id: string): Promise<T | null> {
  check(collection, id);
  if (useBlob) {
    const r = await get(`db/${collection}/${id}.json`, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return JSON.parse(await new Response(r.stream).text()) as T;
  }
  try {
    return JSON.parse(await readFile(path.join(dir(collection), `${id}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function dbPut<T>(collection: string, id: string, value: T): Promise<void> {
  check(collection, id);
  const body = JSON.stringify(value, (_, x) => (typeof x === "bigint" ? x.toString() : x));
  if (useBlob) {
    await put(`db/${collection}/${id}.json`, body, { access: "private", contentType: "application/json", allowOverwrite: true });
    return;
  }
  await mkdir(dir(collection), { recursive: true });
  // Write then rename, so a reader never sees half a file.
  const file = path.join(dir(collection), `${id}.json`);
  await writeFile(`${file}.tmp`, body);
  await rename(`${file}.tmp`, file);
}

export async function dbList<T>(collection: string): Promise<T[]> {
  check(collection);
  if (useBlob) {
    const { blobs } = await list({ prefix: `db/${collection}/` });
    const ids = blobs.map((b) => b.pathname.slice(`db/${collection}/`.length, -".json".length));
    return (await Promise.all(ids.map((id) => dbGet<T>(collection, id)))).filter((x): x is Awaited<T> => x !== null) as T[];
  }
  let files: string[];
  try {
    files = await readdir(dir(collection));
  } catch {
    return [];
  }
  const rows = await Promise.all(files.filter((f) => f.endsWith(".json")).map((f) => dbGet<T>(collection, f.slice(0, -5))));
  return rows.filter((x): x is Awaited<T> => x !== null) as T[];
}
