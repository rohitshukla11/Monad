import "server-only";
/**
 * Plain files that must outlive one server instance (finished renders, the RPC history cache).
 * STORE_DRIVER=blob keeps them as private Vercel Blob objects, like the vault and the app records;
 * "local" (the default) keeps them on disk. On Vercel the disk is per instance and only /tmp is
 * writable, so a deployment there uses blob.
 */
import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const useBlob = () => (process.env.STORE_DRIVER ?? "local") === "blob";

/** The local directory for a kind of file: its env override, else under .data (under /tmp on Vercel). */
export function localDir(envVar: string, sub: string): string {
  const base = process.env.VERCEL ? "/tmp/likeness" : process.cwd();
  return path.resolve(/*turbopackIgnore: true*/ base, process.env[envVar] ?? path.join(".data", sub));
}

export async function filePut(blobPath: string, localFile: string, body: Uint8Array | string, opts: { contentType: string; overwrite: boolean }) {
  if (useBlob()) {
    await put(blobPath, typeof body === "string" ? body : Buffer.from(body), { access: "private", contentType: opts.contentType, allowOverwrite: opts.overwrite });
    return;
  }
  await mkdir(path.dirname(localFile), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ localFile, body, opts.overwrite ? undefined : { flag: "wx" });
}

export async function fileGet(blobPath: string, localFile: string): Promise<Buffer | null> {
  if (useBlob()) {
    const r = await get(blobPath, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  }
  try {
    return await readFile(/*turbopackIgnore: true*/ localFile);
  } catch {
    return null;
  }
}
