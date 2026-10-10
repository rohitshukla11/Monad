/**
 * What a brand agrees to before it can license a face, shown verbatim and signed by the brand's wallet
 * over its version and sha256. Also the brand-side constants shared by the browser and the server.
 */
export const BRAND_POLICY_VERSION = "2026-10-10.1";

export const BRAND_POLICY_POINTS = [
  "We will never use a licensed face for political, adult, minor-involving, impersonating or deceptive content. These uses are banned in the contract itself and by the render service.",
  "Every image or video we publish from a Likeness render says it is AI-generated, and we keep its content credential (C2PA) intact.",
  "When a creator revokes a licence, we stop new uses at once and take down placements we control, as the creator's licence terms require.",
  "We use a render only inside the licence it was made under: its use, regions and dates. We do not reuse, resell or train on it outside that licence.",
  "Profile photos and sample renders on Likeness are previews. They are not licensed for any use.",
] as const;

export function brandPolicyText(): string {
  return [`Likeness brand policy, version ${BRAND_POLICY_VERSION}`, ...BRAND_POLICY_POINTS.map((p, i) => `${i + 1}. ${p}`)].join("\n");
}

export async function brandPolicyHash(): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(brandPolicyText())));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const BRAND_USES = ["Advertising", "Social", "Education", "Games", "Film"] as const;
export type BrandUse = (typeof BRAND_USES)[number];

export const MONTHLY_RENDERS = ["Under 50", "50–500", "500–5,000", "Over 5,000"] as const;

/** Webmail and consumer domains: allowed, but they never prove a company's domain. */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.de", "mail.com",
  "zoho.com", "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "rediffmail.com", "tutanota.com", "fastmail.com",
]);

/** The host of a website ("https://www.levis.com/about" → "levis.com"), lowercased, without "www.". */
export function websiteDomain(website: string): string | null {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

export function emailDomain(email: string): string | null {
  const m = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/.exec(email.trim().toLowerCase());
  return m ? m[1] : null;
}

/**
 * Does the work email belong to the website's domain? Equal, or one a subdomain of the other
 * ("marketing.levis.com" and "levis.com"). Free email domains never match.
 */
export function emailMatchesWebsite(email: string, website: string): boolean {
  const e = emailDomain(email);
  const w = websiteDomain(website);
  if (!e || !w || FREE_EMAIL_DOMAINS.has(e)) return false;
  return e === w || e.endsWith(`.${w}`) || w.endsWith(`.${e}`);
}

export type BrandBadge = "verified-domain" | "unverified";
export const BADGE_LABEL: Record<BrandBadge, string> = { "verified-domain": "Verified domain", unverified: "Unverified brand" };

/** The brand profile as stored (off-chain) and shown to creators. */
export type BrandProfile = {
  address: string;
  name: string;
  website: string;
  /** Only the domain of the work email is kept, not the address. */
  workEmailDomain: string | null;
  badge: BrandBadge;
  /** How the domain was proven: Dynamic's sign-in code or an emailed code. */
  domainProof: "dynamic-signin" | "email-code" | null;
  uses: BrandUse[];
  monthlyRenders: string;
  logo: string | null;
  /** Didit KYB is not wired yet: always "not-run" until it is. */
  kyb: "not-run";
  policy: { version: string; sha256: string; signature: string; message: string; at: number } | null;
  /** The brand wallet's signature over this profile's fields. */
  profileSignature: { message: string; signature: string };
  updatedAt: number;
};

/** The fields a brand signs when saving its profile, in a fixed order. */
export function brandProfileFields(p: { name: string; website: string; uses: readonly string[]; monthlyRenders: string; logoSha256: string | null }) {
  return { company: p.name, website: p.website, uses: p.uses.join("|") || "none", "monthly renders": p.monthlyRenders, logo: p.logoSha256 ?? "none" };
}
