/**
 * PRF salt namespaces. Each namespace is an isolated key domain: the same passkey evaluated under a
 * different salt yields unrelated output (WebAuthn PRF, https://www.w3.org/TR/webauthn-3/#prf-extension;
 * Mera: "a different salt yields an unrelated output", @category-labs/mera getPasskeyPrfOutput).
 *
 * Mera requires a salt of exactly 32 bytes, so each salt is sha256 of the namespace string.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

export type Namespace =
  | { kind: "reference" }
  | { kind: "licence"; licenceId: bigint }
  | { kind: "brand"; brandId: string };

export function namespaceString(ns: Namespace): string {
  switch (ns.kind) {
    case "reference":
      return "likeness:reference";
    case "licence":
      if (ns.licenceId <= 0n) throw new Error("licence id must be positive");
      return `likeness:licence:${ns.licenceId.toString(10)}`;
    case "brand":
      if (!/^[a-z0-9-]{1,64}$/.test(ns.brandId)) throw new Error("brand id must be [a-z0-9-]{1,64}");
      return `likeness:brand:${ns.brandId}`;
  }
}

/** 32-byte PRF salt for a namespace. */
export function prfSalt(ns: Namespace): Uint8Array<ArrayBuffer> {
  return new Uint8Array(sha256(utf8ToBytes(namespaceString(ns))));
}
