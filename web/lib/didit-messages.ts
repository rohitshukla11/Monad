/**
 * Plain-language versions of the server's Didit verdicts (lib/server/didit.ts evaluate()). The server's
 * reasons stay the source of truth and are shown in Details; this only words them for a person.
 */
export function diditFailure(reasons: string[] = [], sessionStatus?: string): { title: string; help: string } {
  const r = reasons.join(" ").toLowerCase();
  const status = (sessionStatus ?? "").toLowerCase();
  if (status.includes("expired") || status === "abandoned" || r.includes("session expired") || r.includes("session abandoned"))
    return { title: "Your verification session expired", help: "It closed before it was finished. Start a new one; it takes about two minutes." };
  if (r.includes("under 18")) return { title: "You need to be 18 or over", help: "Likeness only works with adults. The date of birth on your document is under 18." };
  if (r.includes("liveness")) return { title: "The liveness check didn't pass", help: "Try again in good, even light, facing the camera, with nothing covering your face." };
  if (r.includes("face match")) return { title: "Your selfie didn't match your ID photo", help: "Use your own document, and keep your whole face in view for the selfie." };
  if (r.includes("id verification") || r.includes("date of birth"))
    return { title: "We couldn't verify your ID document", help: "Use a valid passport, ID card or driving licence, flat and in focus, with no glare." };
  return { title: "Didit couldn't verify you this time", help: "Start a new verification and follow each step on Didit's screen." };
}
