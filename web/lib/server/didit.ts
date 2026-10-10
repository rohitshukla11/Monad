import "server-only";
/**
 * Didit identity verification (https://docs.didit.me), base https://verification.didit.me, header
 * x-api-key. One session per creator on DIDIT_WORKFLOW_ID: ID document (OCR, Didit's own 18+ rule),
 * liveness (ACTIVE_3D; Didit may fall back to passive on desktop, so the method is recorded), and face
 * match between the liveness selfie and the document portrait.
 *
 * Results come from the server only: the decision is read with GET /v3/session/{id}/decision/
 * (polled from our status route) or arrives on the signed webhook. Browser callbacks are ignored.
 * We compute 18+ ourselves from the document's date of birth; no date of birth means no attestation.
 *
 * Stored (app DB, "identity/<address>"): the session id, its environment, the outcome and which checks
 * passed. Never the date of birth, document images or selfie. Media URLs are short-lived and are only
 * fetched into memory (the selfie, for the 1:1 face match against each reference photo).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Address } from "viem";
import type { VerificationLevel } from "@/lib/verification";
import { dbGet, dbPut } from "./db";

/** VERIFICATION_LEVEL: "free" (default for now) or "full" (before the live demo). */
export function verificationLevel(): VerificationLevel {
  return process.env.VERIFICATION_LEVEL === "full" ? "full" : "free";
}

export function workflowId(level = verificationLevel()): string | undefined {
  return level === "full" ? process.env.DIDIT_WORKFLOW_ID_FULL : process.env.DIDIT_WORKFLOW_ID_FREE;
}

const BASE = "https://verification.didit.me";

export class DiditError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function key(): string {
  const k = process.env.DIDIT_API_KEY;
  if (!k) throw new DiditError(503, "Liveness not configured and ID check not performed: DIDIT_API_KEY is not set");
  return k;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "x-api-key": key(), accept: "application/json", ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await r.text();
  let j: unknown = text;
  try {
    j = JSON.parse(text);
  } catch {}
  if (!r.ok) {
    const detail = (j as { detail?: string })?.detail ?? (typeof j === "string" ? j.slice(0, 300) : JSON.stringify(j).slice(0, 300));
    throw new DiditError(/credit|balance|top up/i.test(detail) ? 402 : r.status >= 500 ? 502 : r.status, `Didit ${path.split("?")[0]}: HTTP ${r.status}: ${detail}`);
  }
  return j as T;
}

// ---------------------------------------------------------------- sessions

export type DiditSession = { session_id: string; session_token: string; url: string; status: string; vendor_data?: string; workflow_id: string };

export async function createSession(address: Address, callback?: string): Promise<DiditSession> {
  const level = verificationLevel();
  const workflow_id = workflowId(level);
  if (!workflow_id) throw new DiditError(503, `DIDIT_WORKFLOW_ID_${level.toUpperCase()} is not set`);
  // Idempotent on vendor_data: an unfinished session for this wallet is returned again.
  return call<DiditSession>("/v3/session/", {
    method: "POST",
    body: JSON.stringify({ workflow_id, vendor_data: `${address.toLowerCase()}:${level}`, callback, metadata: { app: "likeness", wallet: address.toLowerCase(), level } }),
  });
}

type FeatureResult = { status?: string; warnings?: unknown[] };
export type Decision = {
  session_id: string;
  status: string;
  environment?: "live" | "sandbox";
  vendor_data?: string;
  id_verifications?: (FeatureResult & { date_of_birth?: string | null; age?: number | null; document_type?: string; issuing_state?: string })[];
  liveness_checks?: (FeatureResult & { method?: string; score?: number; reference_image?: string })[];
  face_matches?: (FeatureResult & { score?: number })[];
};

export const getDecision = (sessionId: string) => call<Decision>(`/v3/session/${encodeURIComponent(sessionId)}/decision/`);

/** Best effort: remove the session and its biometric templates once we no longer need them. */
export async function deleteSession(sessionId: string): Promise<string> {
  try {
    const r = await call<{ face_retention_outcome?: string }>(`/v3/session/${encodeURIComponent(sessionId)}/delete/`, {
      method: "DELETE",
      body: JSON.stringify({ deletion_instruction: "privacy_erasure" }),
    });
    return r?.face_retention_outcome ?? "deleted";
  } catch (e) {
    return `not deleted: ${(e as Error).message}`;
  }
}

// ---------------------------------------------------------------- evaluation

export function ageFrom(dob: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--;
  return age;
}

export type Identity = {
  address: Address;
  sessionId: string;
  /** The level this session ran at: its Didit workflow, and which matcher checks the reference photos. */
  level: VerificationLevel;
  environment: "live" | "sandbox" | "unknown";
  state: "pending" | "approved" | "declined";
  sessionStatus: string;
  reasons: string[];
  checks?: { document?: string; issuingState?: string; adult: boolean; livenessMethod?: string; livenessScore?: number; faceMatchScore?: number };
  createdAt: number;
  decidedAt?: number;
  deletedFromDidit?: string;
};

const FINAL_BAD = new Set(["Declined", "Expired", "Abandoned", "Kyc Expired"]);

/** Our verdict from Didit's decision. Every check must pass, and 18+ is computed here from the DOB. */
export function evaluate(d: Decision): Pick<Identity, "state" | "reasons" | "checks" | "environment" | "sessionStatus"> {
  const reasons: string[] = [];
  const id = d.id_verifications?.[0];
  const live = d.liveness_checks?.[0];
  const fm = d.face_matches?.[0];
  const environment = d.environment ?? "unknown";
  if (d.status !== "Approved") {
    const state = FINAL_BAD.has(d.status) ? "declined" : "pending";
    return { state, reasons: [`Didit session ${d.status}`], environment, sessionStatus: d.status };
  }
  const age = id?.date_of_birth ? ageFrom(id.date_of_birth) : null;
  if (id?.status !== "Approved") reasons.push(`ID verification ${id?.status ?? "missing"}`);
  if (age === null) reasons.push("no date of birth on the document");
  else if (age < 18) reasons.push("under 18");
  if (live?.status !== "Approved") reasons.push(`liveness ${live?.status ?? "missing"}`);
  if (fm?.status !== "Approved") reasons.push(`selfie-to-ID face match ${fm?.status ?? "missing"}`);
  return {
    state: reasons.length ? "declined" : "approved",
    reasons,
    environment,
    sessionStatus: d.status,
    checks: {
      document: id?.document_type,
      issuingState: id?.issuing_state,
      adult: age !== null && age >= 18,
      livenessMethod: live?.method,
      livenessScore: live?.score,
      faceMatchScore: fm?.score,
    },
  };
}

export const getIdentity = (address: string) => dbGet<Identity>("identity", address.toLowerCase());
export const saveIdentity = (i: Identity) => dbPut("identity", i.address.toLowerCase(), i);

/** Re-read the decision from Didit and store our verdict. */
export async function refreshIdentity(address: Address): Promise<Identity | null> {
  const prev = await getIdentity(address);
  if (!prev) return null;
  if (prev.state !== "pending") return prev;
  const d = await getDecision(prev.sessionId);
  if (d.vendor_data && d.vendor_data.split(":")[0] !== address.toLowerCase()) throw new DiditError(409, "Didit session belongs to another wallet");
  const v = evaluate(d);
  const next: Identity = { ...prev, ...v, decidedAt: v.state === "pending" ? undefined : Date.now() };
  await saveIdentity(next);
  return next;
}

// ---------------------------------------------------------------- 1:1 face match

/** Download the session's liveness selfie into memory (short-lived presigned URL). */
export async function livenessSelfie(sessionId: string): Promise<Uint8Array> {
  const d = await getDecision(sessionId);
  const url = d.liveness_checks?.[0]?.reference_image;
  if (!url) throw new DiditError(409, "Didit returned no liveness selfie for this session");
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new DiditError(502, `liveness selfie download HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/**
 * POST /v3/face-match/ (multipart): user_image vs ref_image. save_api_request=false so Didit stores
 * neither image. https://docs.didit.me/standalone-apis/face-match
 */
export async function faceMatch(userImage: Uint8Array, refImage: Uint8Array, threshold: number): Promise<{ status: string; score: number | null }> {
  const form = new FormData();
  form.append("user_image", new Blob([userImage as BlobPart], { type: "image/jpeg" }), "capture.jpg");
  form.append("ref_image", new Blob([refImage as BlobPart], { type: "image/jpeg" }), "selfie.jpg");
  form.append("face_match_score_decline_threshold", String(threshold));
  form.append("rotate_image", "true");
  form.append("save_api_request", "false");
  const r = await call<{ face_match?: { status?: string; score?: number | null } }>("/v3/face-match/", { method: "POST", body: form });
  return { status: r.face_match?.status ?? "unknown", score: r.face_match?.score ?? null };
}

// ---------------------------------------------------------------- webhook

const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  if (typeof v === "number" && Number.isFinite(v) && Number.isInteger(v)) return Math.trunc(v);
  return v;
};

/**
 * X-Signature-V2: HMAC-SHA256 (hex) of the canonical JSON (keys sorted, compact); X-Signature: of the
 * raw body. X-Timestamp must be within 300 s. https://docs.didit.me/integration/webhooks
 */
export function verifyWebhook(raw: string, headers: Headers, secret: string): boolean {
  const ts = Number(headers.get("x-timestamp"));
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const v2 = headers.get("x-signature-v2");
  if (v2) {
    const body = JSON.stringify(canonical(JSON.parse(raw)));
    if (eq(v2, createHmac("sha256", secret).update(body).digest("hex"))) return true;
  }
  const v1 = headers.get("x-signature");
  return !!v1 && eq(v1, createHmac("sha256", secret).update(raw).digest("hex"));
}
