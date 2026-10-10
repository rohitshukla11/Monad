import { readFile } from "node:fs/promises";
import path from "node:path";
import { json } from "@/lib/server/http";

/**
 * DEV ONLY. Hands the browser the seeded test wallets (written by `pnpm seed`), so the UI can act as the
 * unverified test creator or the test brand without Dynamic. Off unless the local, non-production
 * server runs with DEV_WALLETS=1; these are throwaway testnet keys, never real users' keys.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.DEV_WALLETS !== "1") return json({ wallets: [] }, 404);
  const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DEV_KEYS_DIR ?? "../.secrets/dev");
  try {
    const seed = JSON.parse(await readFile(path.join(dir, "wallets.json"), "utf8"));
    return json({ wallets: seed.wallets });
  } catch {
    return json({ wallets: [] });
  }
}
