/**
 * Verification levels, and how a creator's level is written on chain.
 *
 *  - "full": Didit ID check (18+), ACTIVE liveness, selfie-to-ID face match, and Didit's 1:1 face match
 *    of each reference photo against the liveness selfie. Needs Didit credit.
 *  - "free": Didit ID check (18+), PASSIVE liveness, selfie-to-ID face match (all within Didit's free
 *    tier), and the reference photos matched to the liveness selfie on our own server with an
 *    open-source face matcher, in memory.
 *
 * CreatorRegistry's attestation has two bytes32 provider fields. We write
 *   ageProvider      = "didit" | "didit-sandbox"
 *   livenessProvider = "<ageProvider>:<method>", method = the liveness Didit actually ran:
 *                      "active" (ACTIVE_3D), "flash" (FLASHING) or "passive" (PASSIVE)
 * so anyone reading the chain sees which liveness backed the attestation.
 */
export type VerificationLevel = "free" | "full";

export const LEVEL_SUMMARY: Record<VerificationLevel, string> = {
  free: "passive liveness; reference photos matched on the Likeness server",
  full: "active liveness; reference photos matched by Didit",
};

export type LivenessMethod = "active" | "flash" | "passive" | "unknown";

export function livenessMethodOf(didit?: string): LivenessMethod {
  switch ((didit ?? "").toUpperCase()) {
    case "ACTIVE_3D":
      return "active";
    case "FLASHING":
      return "flash";
    case "PASSIVE":
      return "passive";
    default:
      return "unknown";
  }
}

export function livenessProviderName(sandbox: boolean, method: LivenessMethod): string {
  return `${sandbox ? "didit-sandbox" : "didit"}:${method}`;
}

/** Parse "didit:passive" or "didit-sandbox:active". Null for anything that is not Didit. */
export function parseDiditLiveness(name: string): { sandbox: boolean; method: LivenessMethod } | null {
  const m = /^(didit|didit-sandbox):(active|flash|passive|unknown)$/.exec(name);
  return m ? { sandbox: m[1] === "didit-sandbox", method: m[2] as LivenessMethod } : null;
}

export const LIVENESS_NOTE: Record<LivenessMethod, string> = {
  active: "Active liveness (Didit 3D action and flash).",
  flash: "Active liveness (Didit 3D flash).",
  passive: "Passive liveness only: weaker than active liveness against deepfakes and camera-injection attacks.",
  unknown: "Liveness method not reported.",
};

/** Assurance order for upgrades: an attestation can only be replaced by a strictly stronger one. */
export const LIVENESS_RANK: Record<LivenessMethod, number> = { unknown: 0, passive: 1, flash: 2, active: 2 };

export function levelOfMethod(m: LivenessMethod): VerificationLevel | null {
  return m === "passive" ? "free" : m === "active" || m === "flash" ? "full" : null;
}
