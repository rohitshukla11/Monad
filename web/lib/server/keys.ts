import "server-only";
/**
 * Server signing keys. Locally each key stays in its file under ../.secrets/ (mode 0600) and the env
 * only names the file; a hosted deployment can pass the value instead. Keys are never logged.
 */
import { readFileSync } from "node:fs";

export function loadKey(fileVar: string, valueVar: string): `0x${string}` | undefined {
  const file = process.env[fileVar];
  const key = file ? readFileSync(file, "utf8").trim() : process.env[valueVar];
  return key && /^0x[0-9a-fA-F]{64}$/.test(key) ? (key as `0x${string}`) : undefined;
}
