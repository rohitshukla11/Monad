import "server-only";
/**
 * C2PA manifests for every render (@contentauth/c2pa-node 0.9.9, c2pa-rs underneath).
 *
 * Each output carries a signed manifest with:
 *  - c2pa.actions: "c2pa.created" by the model (or by the DevRenderer, marked as a test), with the
 *    IPTC digital source type for AI output;
 *  - c2pa.training-mining: AI training and mining not allowed;
 *  - xyz.likeness.licence: the licence id, chain, contracts, creator, licensee, render index and how
 *    to find the receipt. The receipt is keyed by sha256 of this exact file (manifest included), so
 *    the manifest says where to look it up rather than carrying a transaction hash that cannot exist
 *    before the file does.
 *
 * Signed with a TEST certificate chain (scripts/c2pa-testcert.sh). It is not on the C2PA trust list,
 * so validators report "signing certificate untrusted"; the verifier page says so plainly.
 */
import { Builder, LocalSigner, Reader } from "@contentauth/c2pa-node";
import { secretText } from "./secret";

export const LICENCE_ASSERTION = "xyz.likeness.licence";

export type LicenceAssertion = {
  protocol: "likeness/1";
  chainId: number;
  licenceId: string;
  renderIndex: number;
  creator: string;
  licensee: string;
  category: string;
  licenceRegistry: string;
  escrow: string;
  receipt: { anchor: string; key: "sha256 of this file, manifest included"; lookup: string };
  renderAgent: string;
  renderer: { provider: string; model: string; test: boolean };
  promptSha256: string;
  createdAt: string;
};

function signer() {
  const cert = secretText("C2PA_CERT_PEM", "C2PA_CERT_FILE", "../.secrets/c2pa/signer.pem");
  const key = secretText("C2PA_KEY_PEM", "C2PA_KEY_FILE", "../.secrets/c2pa/signer.key");
  try {
    if (!cert || !key) throw new Error("missing");
    return LocalSigner.newSigner(Buffer.from(cert), Buffer.from(key), "es256");
  } catch {
    throw Object.assign(new Error("C2PA signing certificate missing: run `sh scripts/c2pa-testcert.sh` (test certificate)"), { status: 503 });
  }
}

const SOURCE_TYPE = {
  model: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
  test: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic",
};

export function embedManifest(bytes: Uint8Array, mime: "image/jpeg" | "image/png", a: LicenceAssertion): Uint8Array {
  const builder = Builder.withJson({
    claim_generator_info: [{ name: "Likeness render service", version: "0.1.0" }],
    title: `likeness-licence-${a.licenceId}-render-${a.renderIndex}.${mime === "image/png" ? "png" : "jpg"}`,
    format: mime,
    assertions: [
      {
        label: "c2pa.actions",
        data: {
          actions: [
            {
              action: "c2pa.created",
              digitalSourceType: a.renderer.test ? SOURCE_TYPE.test : SOURCE_TYPE.model,
              softwareAgent: { name: a.renderer.test ? "Likeness DevRenderer (TEST RENDER, no model)" : a.renderer.model },
            },
          ],
        },
      },
      {
        label: "c2pa.training-mining",
        data: {
          entries: {
            "c2pa.ai_generative_training": { use: "notAllowed" },
            "c2pa.ai_inference": { use: "notAllowed" },
            "c2pa.ai_training": { use: "notAllowed" },
            "c2pa.data_mining": { use: "notAllowed" },
          },
        },
      },
      { label: LICENCE_ASSERTION, data: a },
    ],
  } as never);
  const out: { buffer: Buffer | null } = { buffer: null };
  builder.sign(signer(), { buffer: Buffer.from(bytes), mimeType: mime }, out as never);
  if (!out.buffer) throw new Error("C2PA signing produced no output");
  return new Uint8Array(out.buffer);
}

export type ManifestRead =
  | { present: false; error?: string }
  | {
      present: true;
      licence: LicenceAssertion | null;
      signer: { issuer?: string; commonName?: string; alg?: string };
      /** c2pa-rs validation codes; "signingCredential.untrusted" is expected for the test certificate. */
      validation: { code: string; explanation?: string }[];
      signatureValid: boolean;
      trustedSigner: boolean;
      generator?: string;
    };

export async function readManifest(bytes: Uint8Array, mime: string): Promise<ManifestRead> {
  let reader;
  try {
    reader = await Reader.fromAsset({ buffer: Buffer.from(bytes), mimeType: mime });
  } catch (e) {
    return { present: false, error: (e as Error).message };
  }
  if (!reader) return { present: false };
  const store = reader.json() as unknown as {
    active_manifest?: string;
    manifests: Record<string, { assertions?: { label: string; data: unknown }[]; signature_info?: { issuer?: string; common_name?: string; alg?: string }; claim_generator_info?: { name?: string }[] }>;
    validation_status?: { code: string; explanation?: string }[];
  };
  const m = store.active_manifest ? store.manifests[store.active_manifest] : undefined;
  if (!m) return { present: false, error: "no active manifest" };
  const validation = store.validation_status ?? [];
  const failures = validation.filter((v) => v.code !== "signingCredential.untrusted");
  const licence = (m.assertions?.find((x) => x.label === LICENCE_ASSERTION)?.data as LicenceAssertion | undefined) ?? null;
  return {
    present: true,
    licence,
    signer: { issuer: m.signature_info?.issuer, commonName: m.signature_info?.common_name, alg: m.signature_info?.alg },
    validation,
    signatureValid: failures.length === 0,
    trustedSigner: !validation.some((v) => v.code === "signingCredential.untrusted"),
    generator: m.claim_generator_info?.[0]?.name,
  };
}
