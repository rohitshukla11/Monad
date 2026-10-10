import "server-only";
/**
 * Brand profiles, kept off-chain and signed by the brand wallet.
 *
 * The badge is computed here, never chosen by the brand: "Verified domain" only when the brand has proven
 * it controls a work email AND that email's domain matches the website's domain. Two proofs count:
 *   - the email it signed in with, as stated in Dynamic's signed session token (JWT, checked against
 *     the environment's JWKS) whose credentials include this brand wallet;
 *   - a 6-digit code sent to the work email (needs RESEND_API_KEY; without it this path says so).
 * Free email domains are allowed but always show "Unverified brand". KYB (Didit) is not wired yet: the
 * profile says "not-run", and nothing claims otherwise.
 */
import { createHash, createPublicKey, randomInt, verify as verifySig } from "node:crypto";
import type { Address } from "viem";
import type { SignedAction } from "@/lib/auth";
import {
  BRAND_POLICY_VERSION,
  BRAND_USES,
  MONTHLY_RENDERS,
  brandPolicyHash,
  brandProfileFields,
  emailDomain,
  emailMatchesWebsite,
  websiteDomain,
  type BrandBadge,
  type BrandProfile,
} from "@/lib/brand-policy";
import { verifyAction } from "./auth";
import { singleton } from "./chain";
import { dbGet, dbPut } from "./db";
import { HttpError } from "./http";
import { publishLogo, sha256 } from "./media";
import { signToken } from "./tokens";

const key = (a: string) => a.toLowerCase();
export const getBrand = (address: string) => dbGet<BrandProfile>("brands", key(address));

type EmailProof = { emailDomain: string; method: "dynamic-signin" | "email-code"; at: number };
const proofOf = (address: string) => dbGet<EmailProof>("brand-email-proofs", key(address));

// ---------------------------------------------------------------- email proof: Dynamic session token

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;

async function dynamicJwks(): Promise<Jwk[]> {
  const env = process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID;
  if (!env) throw new HttpError(503, "Dynamic is not configured on this server");
  if (jwksCache && Date.now() - jwksCache.at < 10 * 60_000) return jwksCache.keys;
  const r = await fetch(`https://app.dynamic.xyz/api/v0/sdk/${env}/.well-known/jwks`, { cache: "no-store" });
  if (!r.ok) throw new HttpError(502, `could not fetch Dynamic's signing keys (${r.status})`);
  const keys = ((await r.json()) as { keys: Jwk[] }).keys;
  jwksCache = { at: Date.now(), keys };
  return keys;
}

type DynamicClaims = {
  exp: number;
  email?: string;
  environment_id?: string;
  verified_credentials?: { format?: string; address?: string; email?: string }[];
};

/** Verify a Dynamic session JWT (RS256) and return its claims. */
export async function verifyDynamicJwt(token: string): Promise<DynamicClaims> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new HttpError(400, "not a session token");
  const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as { kid?: string; alg?: string };
  if (header.alg !== "RS256") throw new HttpError(400, "unexpected token algorithm");
  const jwk = (await dynamicJwks()).find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, "token not signed by this Dynamic environment");
  const ok = verifySig("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s, "base64url"));
  if (!ok) throw new HttpError(401, "token signature does not verify");
  const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as DynamicClaims;
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new HttpError(401, "session token expired; sign in again");
  if (claims.environment_id && claims.environment_id !== process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID) throw new HttpError(401, "token is for another Dynamic environment");
  return claims;
}

/** Record the sign-in email as proven, if the token belongs to this brand wallet. */
export async function proveEmailWithDynamic(address: Address, token: string) {
  const claims = await verifyDynamicJwt(token);
  const wallets = (claims.verified_credentials ?? []).map((c) => c.address?.toLowerCase()).filter(Boolean);
  if (!wallets.includes(key(address))) throw new HttpError(401, "this sign-in session is not for this wallet");
  const email = claims.email ?? claims.verified_credentials?.find((c) => c.format === "email")?.email;
  const domain = email ? emailDomain(email) : null;
  if (!domain) throw new HttpError(422, "no email in this sign-in session");
  await dbPut("brand-email-proofs", key(address), { emailDomain: domain, method: "dynamic-signin", at: Date.now() } satisfies EmailProof);
  await refreshBadge(address);
  return { emailDomain: domain, method: "dynamic-signin" as const };
}

// ---------------------------------------------------------------- email proof: a code sent to the work email

/** "resend" when RESEND_API_KEY is set; "test" only outside production with MAILER=test (tests read the code). */
export function mailer(): "resend" | "test" | null {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.MAILER === "test" && process.env.NODE_ENV !== "production") return "test";
  return null;
}
const testOutbox = singleton("brand-test-outbox", () => new Map<string, string>());
export const testMailbox = (email: string) => testOutbox.get(email.toLowerCase());

const codeHash = (address: string, email: string, code: string) => createHash("sha256").update(`${key(address)}|${email.toLowerCase()}|${code}`).digest("hex");

export async function sendEmailCode(address: Address, auth: SignedAction, email: string) {
  const fields = await verifyAction(auth, "verify work email", address);
  if (fields.wallet !== key(address) || fields.email !== email.toLowerCase()) throw new HttpError(401, "signature is for another email");
  if (!emailDomain(email)) throw new HttpError(400, "not an email address");
  const m = mailer();
  if (!m) throw new HttpError(503, "email codes are not set up on this server (RESEND_API_KEY). Sign in with your work email instead, or continue as an unverified brand.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await dbPut("brand-email-codes", key(address), { email: email.toLowerCase(), hash: codeHash(address, email, code), exp: Date.now() + 15 * 60_000, tries: 0 });
  if (m === "test") testOutbox.set(email.toLowerCase(), code);
  else {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? "Likeness <onboarding@resend.dev>",
        to: [email],
        subject: `Your Likeness code: ${code}`,
        text: `Your code to verify this work email for Likeness is ${code}. It expires in 15 minutes. If you did not ask for it, ignore this email.`,
      }),
    });
    if (!r.ok) throw new HttpError(502, `the email could not be sent (${r.status})`);
  }
  return { sent: true };
}

export async function confirmEmailCode(address: Address, code: string) {
  const rec = await dbGet<{ email: string; hash: string; exp: number; tries: number }>("brand-email-codes", key(address));
  if (!rec || rec.exp < Date.now()) throw new HttpError(410, "the code expired; ask for a new one");
  if (rec.tries >= 5) throw new HttpError(429, "too many tries; ask for a new code");
  if (codeHash(address, rec.email, code.trim()) !== rec.hash) {
    await dbPut("brand-email-codes", key(address), { ...rec, tries: rec.tries + 1 });
    throw new HttpError(422, "that code is not right");
  }
  await dbPut("brand-email-codes", key(address), { ...rec, exp: 0 });
  const domain = emailDomain(rec.email)!;
  await dbPut("brand-email-proofs", key(address), { emailDomain: domain, method: "email-code", at: Date.now() } satisfies EmailProof);
  await refreshBadge(address);
  return { emailDomain: domain, method: "email-code" as const };
}

// ---------------------------------------------------------------- profile, policy, session

/** Re-derive a saved profile's badge after a new email proof. */
async function refreshBadge(address: string) {
  const b = await getBrand(address);
  if (!b) return;
  const proof = await proofOf(address);
  await dbPut("brands", key(address), { ...b, workEmailDomain: proof?.emailDomain ?? null, domainProof: proof?.method ?? null, badge: badgeFor(proof, b.website), updatedAt: Date.now() });
}

export async function emailProof(address: string) {
  return proofOf(address);
}

export function badgeFor(proof: EmailProof | null, website: string): BrandBadge {
  return proof && emailMatchesWebsite(`x@${proof.emailDomain}`, website) ? "verified-domain" : "unverified";
}

export async function saveBrandProfile(input: {
  address: Address;
  auth: SignedAction;
  name: string;
  website: string;
  uses: string[];
  monthlyRenders: string;
  logo?: string | null;
}) {
  const who = key(input.address);
  const name = input.name.trim().slice(0, 80);
  const website = input.website.trim().slice(0, 200);
  if (name.length < 2) throw new HttpError(400, "add your company name");
  if (!websiteDomain(website)) throw new HttpError(400, "add your company website, e.g. levis.com");
  const uses = input.uses.filter((u) => (BRAND_USES as readonly string[]).includes(u));
  if (uses.length === 0) throw new HttpError(400, "pick at least one intended use");
  const monthlyRenders = (MONTHLY_RENDERS as readonly string[]).includes(input.monthlyRenders) ? input.monthlyRenders : MONTHLY_RENDERS[0];

  let logoBytes: Buffer | null = null;
  if (input.logo) {
    logoBytes = Buffer.from(input.logo, "base64");
    if (logoBytes.length > 4 * 1024 * 1024) throw new HttpError(413, "logo too large (4 MB at most)");
  }
  const fields = await verifyAction(input.auth, "save brand profile", input.address);
  const want = { wallet: who, ...brandProfileFields({ name, website, uses, monthlyRenders, logoSha256: logoBytes ? sha256(logoBytes) : null }) };
  if (Object.entries(want).some(([k, v]) => fields[k] !== v)) throw new HttpError(401, "signature does not match this profile");

  const prev = await getBrand(who);
  const logo = logoBytes ? `/api/media/brand-logo/${(await publishLogo(logoBytes, who)).sha256}` : (prev?.logo ?? null);
  const proof = await proofOf(who);
  const profile: BrandProfile = {
    address: who,
    name,
    website,
    workEmailDomain: proof?.emailDomain ?? null,
    badge: badgeFor(proof, website),
    domainProof: proof?.method ?? null,
    uses: uses as BrandProfile["uses"],
    monthlyRenders,
    logo,
    kyb: "not-run",
    policy: prev?.policy ?? null,
    profileSignature: input.auth,
    updatedAt: Date.now(),
  };
  await dbPut("brands", who, profile);
  return profile;
}

export async function signBrandPolicy(address: Address, auth: SignedAction) {
  const who = key(address);
  const prev = await getBrand(who);
  if (!prev) throw new HttpError(409, "save your company details first");
  const fields = await verifyAction(auth, "agree to the brand policy", address);
  const hash = await brandPolicyHash();
  if (fields.wallet !== who || fields.version !== BRAND_POLICY_VERSION || fields["text sha256"] !== hash) throw new HttpError(401, "signature is for another version of the policy");
  const profile = { ...prev, policy: { version: BRAND_POLICY_VERSION, sha256: hash, signature: auth.signature, message: auth.message, at: Date.now() }, updatedAt: Date.now() };
  await dbPut("brands", who, profile);
  return profile;
}

/** A brand profile is complete once its policy is signed at the current version. */
export const isComplete = (b: BrandProfile | null) => !!b && b.policy?.version === BRAND_POLICY_VERSION;

/** A 2-hour brand session (for sample images), after a wallet signature, for complete profiles only. */
export async function startBrandSession(address: Address, auth: SignedAction) {
  const fields = await verifyAction(auth, "start brand session", address);
  if (fields.wallet !== key(address)) throw new HttpError(401, "signature is for another wallet");
  if (!isComplete(await getBrand(address))) throw new HttpError(403, "finish your brand profile first");
  return { token: signToken("brand-session", { b: key(address) }, 2 * 60 * 60), expiresIn: 2 * 60 * 60 };
}

/** What creators, the verifier and receipts show about a brand. */
export type BrandCard = { address: string; name: string; logo: string | null; badge: BrandBadge; website: string };
export async function brandCards(addresses: string[]): Promise<Record<string, BrandCard>> {
  const unique = [...new Set(addresses.map(key))].slice(0, 50);
  const rows = await Promise.all(unique.map((a) => getBrand(a)));
  return Object.fromEntries(rows.filter((b): b is BrandProfile => !!b).map((b) => [b.address, { address: b.address, name: b.name, logo: b.logo, badge: b.badge, website: b.website }]));
}
