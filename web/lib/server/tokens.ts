import "server-only";
/**
 * Short-lived signed tokens: brand sessions (after a wallet signature) and signed media URLs. HMAC-SHA256
 * under a key derived (HKDF) from the attester key, so every server instance agrees on it without a new
 * secret to configure. A token is `payload.mac`, both base64url; the payload carries its expiry.
 */
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { loadKey } from "./keys";

function key(purpose: string): Buffer {
  const attester = loadKey("ATTESTER_KEY_FILE", "ATTESTER_PRIVATE_KEY");
  if (!attester) throw Object.assign(new Error("signed links need the attester key (ATTESTER_PRIVATE_KEY)"), { status: 503 });
  return Buffer.from(hkdfSync("sha256", Buffer.from(attester.slice(2), "hex"), Buffer.alloc(0), `likeness/tokens/v1|${purpose}`, 32));
}

export function signToken(purpose: string, payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const mac = createHmac("sha256", key(purpose)).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** The payload, or null if the token is forged, for another purpose, malformed or expired. */
export function readToken<T extends Record<string, unknown>>(purpose: string, token: string | null | undefined): (T & { exp: number }) | null {
  if (!token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [body, mac] = token.split(".");
  const want = createHmac("sha256", key(purpose)).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return typeof p.exp === "number" && p.exp > Math.floor(Date.now() / 1000) ? p : null;
  } catch {
    return null;
  }
}
