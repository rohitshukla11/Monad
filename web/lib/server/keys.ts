import "server-only";
/**
 * Server signing keys. Locally each key stays in its file under ../.secrets/ (mode 0600) and the env
 * only names the file; a hosted deployment passes the value instead (see ./secret). Never logged.
 */
import { secretText } from "./secret";

export function loadKey(fileVar: string, valueVar: string): `0x${string}` | undefined {
  const key = secretText(valueVar, fileVar)?.trim();
  return key && /^0x[0-9a-fA-F]{64}$/.test(key) ? (key as `0x${string}`) : undefined;
}
