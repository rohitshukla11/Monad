/**
 * What a creator agrees to before any verification. Shown verbatim, signed by the creator's wallet
 * over its version and sha256, and stored (app/api/consent); attestation requires the current version.
 * Didit asks its customers to name Didit as processor, link its notices, and collect explicit consent
 * for biometrics before capture (https://docs.didit.me/getting-started/security-compliance).
 */
export const CONSENT_VERSION = "2026-10-10.1";

export const DIDIT_LINKS = {
  privacy: "https://didit.me/terms/verification-privacy-notice",
  terms: "https://didit.me/terms/identity-verification",
};

export const CONSENT_POINTS = [
  "I am 18 or over, and the face I am about to verify and license is my own.",
  "Likeness asks Didit (an identity verification provider processing in the EU) to verify me on its behalf: Didit reads my identity document, records a liveness check of my face, and compares my face to the photo on the document. Didit acts as Likeness's processor under its verification privacy notice and identity verification terms.",
  "Likeness asks Didit to compare each of my three reference photos with my liveness selfie, without storing those comparisons.",
  "Likeness keeps only the outcome (verified, 18 or over, which checks passed), the Didit session reference and hashes. It does not keep my date of birth, document images or selfie. Once I am attested, Likeness asks Didit to delete my verification session, including its biometric data.",
  "My three reference photos are encrypted in this browser under a key from my passkey. Likeness stores only the ciphertext; the blockchain holds only a hash of it.",
  "When I release my photos for a licence, the render service decrypts them in memory for that licence only and sends them to Google's Gemini API to generate images. Google may keep those requests for up to 55 days to detect abuse.",
  "Licences can never cover political, adult, minor-involving, impersonating or deceptive uses. I can revoke any licence, or all of them, at any time; images already delivered cannot be recalled, and they stay marked as licensed when made.",
] as const;

export function consentText(): string {
  return [`Likeness creator consent, version ${CONSENT_VERSION}`, ...CONSENT_POINTS.map((p, i) => `${i + 1}. ${p}`), `Didit privacy notice: ${DIDIT_LINKS.privacy}`, `Didit identity verification terms: ${DIDIT_LINKS.terms}`].join("\n");
}

export async function consentTextHash(): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(consentText())));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
