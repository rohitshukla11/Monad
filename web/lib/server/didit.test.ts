/**
 * Didit decision handling without the network: our own 18+ rule, every check required, and the
 * webhook signature (V2 canonical JSON, and raw-body V1) with its 300 s window.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { consentText, consentTextHash } from "@/lib/consent";
import { ageFrom, evaluate, verifyWebhook, type Decision } from "./didit";

const approved = (dob: string | null, over: Partial<Decision> = {}): Decision => ({
  session_id: "s1",
  status: "Approved",
  environment: "live",
  id_verifications: [{ status: "Approved", date_of_birth: dob, document_type: "Passport", issuing_state: "IND" }],
  liveness_checks: [{ status: "Approved", method: "ACTIVE_3D", score: 97 }],
  face_matches: [{ status: "Approved", score: 88 }],
  ...over,
});

describe("Didit decision", () => {
  it("computes age from the date of birth", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    expect(ageFrom("2008-10-10", now)).toBe(18);
    expect(ageFrom("2008-10-11", now)).toBe(17);
    expect(ageFrom("10/10/2008", now)).toBeNull();
  });

  it("approves only an adult with every check passed", () => {
    const ok = evaluate(approved("1990-01-01"));
    expect(ok.state).toBe("approved");
    expect(ok.checks?.adult).toBe(true);
    expect(ok.environment).toBe("live");
    expect(evaluate(approved(null)).reasons).toContain("no date of birth on the document");
    const minor = new Date();
    minor.setUTCFullYear(minor.getUTCFullYear() - 17);
    expect(evaluate(approved(minor.toISOString().slice(0, 10))).reasons).toContain("under 18");
    expect(evaluate(approved("1990-01-01", { liveness_checks: [{ status: "Declined" }] })).state).toBe("declined");
    expect(evaluate(approved("1990-01-01", { face_matches: [{ status: "In Review" }] })).state).toBe("declined");
  });

  it("keeps waiting while Didit is not finished, and stops on a final refusal", () => {
    expect(evaluate({ session_id: "s", status: "In Progress" }).state).toBe("pending");
    expect(evaluate({ session_id: "s", status: "In Review" }).state).toBe("pending");
    expect(evaluate({ session_id: "s", status: "Declined" }).state).toBe("declined");
    expect(evaluate({ session_id: "s", status: "Expired" }).state).toBe("declined");
  });
});

describe("Didit webhook signature", () => {
  const secret = "whsec_test";
  const body = { webhook_type: "status.updated", session_id: "s1", status: "Approved", vendor_data: "0xabc", decision: { b: 2, a: 1.0 } };
  const raw = JSON.stringify(body);
  const headers = (h: Record<string, string>) => new Headers({ "x-timestamp": String(Math.floor(Date.now() / 1000)), ...h });

  it("accepts V2 over canonical (sorted) JSON and V1 over the raw body", () => {
    const canonical = '{"decision":{"a":1,"b":2},"session_id":"s1","status":"Approved","vendor_data":"0xabc","webhook_type":"status.updated"}';
    expect(verifyWebhook(raw, headers({ "x-signature-v2": createHmac("sha256", secret).update(canonical).digest("hex") }), secret)).toBe(true);
    expect(verifyWebhook(raw, headers({ "x-signature": createHmac("sha256", secret).update(raw).digest("hex") }), secret)).toBe(true);
  });

  it("rejects a wrong secret, a tampered body and a stale timestamp", () => {
    const sig = createHmac("sha256", secret).update(raw).digest("hex");
    expect(verifyWebhook(raw, headers({ "x-signature": createHmac("sha256", "other").update(raw).digest("hex") }), secret)).toBe(false);
    expect(verifyWebhook(raw.replace("Approved", "Declined"), headers({ "x-signature": sig }), secret)).toBe(false);
    expect(verifyWebhook(raw, new Headers({ "x-timestamp": String(Math.floor(Date.now() / 1000) - 400), "x-signature": sig }), secret)).toBe(false);
  });
});

describe("consent", () => {
  it("hashes the exact text shown", async () => {
    expect(await consentTextHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(consentText()).toContain("Didit");
    expect(consentText()).toContain("Gemini");
  });
});

describe("level on chain", () => {
  it("reads the liveness method back from the attestation providers", async () => {
    const { stringToHex } = await import("viem");
    const { trustOf } = await import("@/lib/licensing");
    const { livenessProviderName, livenessMethodOf } = await import("@/lib/verification");
    const b = (s: string) => stringToHex(s, { size: 32 });
    expect(livenessProviderName(false, livenessMethodOf("PASSIVE"))).toBe("didit:passive");
    expect(livenessProviderName(true, livenessMethodOf("ACTIVE_3D"))).toBe("didit-sandbox:active");
    const passive = trustOf(b("didit:passive"), b("didit"));
    expect(passive).toMatchObject({ level: "verified", livenessMethod: "passive", sandbox: false });
    expect(trustOf(b("didit-sandbox:active"), b("didit-sandbox"))).toMatchObject({ level: "verified", livenessMethod: "active", sandbox: true });
    expect(trustOf(b("didit"), b("didit")).level).toBe("unknown");
    expect(trustOf(b("dev-unverified"), b("dev-unverified")).level).toBe("unverified-test");
  });
});
