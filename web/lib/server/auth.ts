import "server-only";
import { verifyMessage, type Address } from "viem";
import { parseActionMessage, type SignedAction } from "@/lib/auth";
import { pub, singleton } from "./chain";

const MAX_AGE = 5 * 60_000;
const seen = singleton("auth-seen", () => new Map<string, number>());

export class AuthError extends Error {
  readonly status = 401;
}

/**
 * Check a signed action: right action, signed by `signer`, fresh, and not replayed. Smart-contract
 * wallets are covered too (viem's publicClient.verifyMessage does ERC-1271 / ERC-6492).
 */
export async function verifyAction(a: SignedAction | undefined, action: string, signer: Address): Promise<Record<string, string>> {
  if (!a?.message || !a.signature) throw new AuthError("missing wallet signature");
  const parsed = parseActionMessage(a.message);
  if (!parsed || parsed.action !== action) throw new AuthError("signature is for another action");
  if (Math.abs(Date.now() - parsed.issuedAt) > MAX_AGE) throw new AuthError("signature expired; sign again");
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > MAX_AGE * 2) seen.delete(k);
  if (seen.has(a.signature)) throw new AuthError("signature already used");
  const ok =
    (await verifyMessage({ address: signer, message: a.message, signature: a.signature }).catch(() => false)) ||
    (await pub().verifyMessage({ address: signer, message: a.message, signature: a.signature }).catch(() => false));
  if (!ok) throw new AuthError("not signed by the expected wallet");
  seen.set(a.signature, now);
  return parsed.fields;
}
