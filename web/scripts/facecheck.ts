/**
 * LOCAL-ONLY face check, outside the protocol: does the Gemini image model keep your face?
 *
 *   pnpm facecheck
 *
 * Reads up to 3 photos (JPEG or PNG) from ../.secrets/facecheck/, sends them straight to Gemini with
 * two ad-style prompts, and writes the results next to them as facecheck-out-*.png|jpg. Nothing is
 * registered, sealed, uploaded to the vault or stored anywhere else; ../.secrets/ is git-ignored.
 * Uses the same request as the production renderer (lib/server/render/gemini).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const DIR = path.resolve("../.secrets/facecheck");
const PROMPTS = [
  "Smiling in a bright, sunlit cafe holding a ceramic coffee cup, natural light, lifestyle product shot for a spring advertising campaign",
  "Walking through a city street at golden hour wearing a navy jacket, candid fashion advertising photo, shallow depth of field",
];

async function main() {
  process.loadEnvFile(".env.local");
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set in web/.env.local");
  const files = readdirSync(DIR)
    .filter((f) => /\.(jpe?g|png)$/i.test(f) && !f.startsWith("facecheck-out-"))
    .sort()
    .slice(0, 3);
  if (files.length === 0) throw new Error(`put 1 to 3 JPEG or PNG photos of yourself in ${DIR}`);
  // Normalise to JPEG, upright, at most 1536 px on the long side (smaller requests, same face).
  const references = await Promise.all(
    files.map(async (f) => new Uint8Array(await sharp(readFileSync(path.join(DIR, f))).rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer())),
  );
  console.log(`references: ${files.join(", ")}`);
  const { geminiRender } = await import("@/lib/server/render/gemini");
  for (const [i, prompt] of PROMPTS.entries()) {
    const t = Date.now();
    try {
      const out = await geminiRender({ prompt, references, licenceId: 0n, renderIndex: i });
      const file = path.join(DIR, `facecheck-out-${i + 1}.${out.mime === "image/png" ? "png" : "jpg"}`);
      writeFileSync(file, out.bytes, { mode: 0o600 });
      console.log(`${out.model}: ${file} (${Math.round(out.bytes.length / 1024)} KB, ${Date.now() - t} ms) usage ${JSON.stringify(out.usage)}`);
    } catch (e) {
      console.log(`prompt ${i + 1} failed: ${(e as Error).message}`);
    }
  }
  references.forEach((r) => r.fill(0));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
