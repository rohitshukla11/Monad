/**
 * The cross-device test, automated. A fake authenticator implements WebAuthn PRF as
 * HMAC-SHA256(credential secret, rpId || salt), the shape of CTAP hmac-secret. "Syncing" the passkey
 * means giving a second authenticator instance the same credential, which is what iCloud Keychain or
 * Google Password Manager do. The live version of this test runs on two real devices.
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { WebAuthnClient } from "@category-labs/mera";
import { beforeAll, describe, expect, it } from "vitest";
import { openItem, openReferenceSet, referenceSetHash, sealReferenceSet, unwrapDek } from "./envelope";
import { brandIdentitySeed } from "./keys";
import { namespaceString, prfSalt } from "./namespaces";
import { createPasskey, namespaceKey } from "./passkey";
import { acceptRelease, newServiceKey, releaseToService, unwrapForLicence, wrapForLicence } from "./release";

type Credential = { id: Uint8Array; secret: Uint8Array; rpId: string };

/** One device's authenticator. `sync` copies credentials in, like a password manager would. */
function authenticator(): WebAuthnClient & { sync(from: Credential[]): void; credentials: Credential[] } {
  const credentials: Credential[] = [];
  const prf = (c: Credential, salt: Uint8Array) => hmac(sha256, c.secret, concatBytes(utf8ToBytes(c.rpId), salt));
  return {
    credentials,
    sync(from) {
      credentials.push(...from);
    },
    async createCredential(req) {
      const c = { id: crypto.getRandomValues(new Uint8Array(16)), secret: crypto.getRandomValues(new Uint8Array(32)), rpId: req.rp.id };
      credentials.push(c);
      return { credentialId: c.id, prfEnabled: true, prfOutput: prf(c, req.prfSalt) };
    },
    async getCredential(req) {
      const c = credentials.find((x) => x.rpId === req.rpId);
      if (!c) throw new Error("no passkey for this rpId on this device");
      return { credentialId: c.id, prfOutput: prf(c, req.prfSalt) };
    },
  };
}

const creator = "0x1111111111111111111111111111111111111111";
const captures = [utf8ToBytes("capture-front"), utf8ToBytes("capture-left"), utf8ToBytes("capture-right")];

beforeAll(() => {
  process.env.NEXT_PUBLIC_RP_ID = "likeness.example";
});

describe("namespaces", () => {
  it("are 32-byte sha256 salts of fixed strings", () => {
    expect(namespaceString({ kind: "reference" })).toBe("likeness:reference");
    expect(namespaceString({ kind: "licence", licenceId: 7n })).toBe("likeness:licence:7");
    expect(namespaceString({ kind: "brand", brandId: "acme" })).toBe("likeness:brand:acme");
    const s = prfSalt({ kind: "reference" });
    expect(s.length).toBe(32);
    expect(bytesToHex(s)).toBe(bytesToHex(sha256(utf8ToBytes("likeness:reference"))));
  });

  it("reject malformed ids", () => {
    expect(() => namespaceString({ kind: "licence", licenceId: 0n })).toThrow();
    expect(() => namespaceString({ kind: "brand", brandId: "Acme Corp" })).toThrow();
  });
});

describe("cross-device", () => {
  it("a synced second device re-derives the same key and decrypts device A's reference set", async () => {
    const deviceA = authenticator();
    const a = await createPasskey({ name: "creator", displayName: "Creator" }, { kind: "reference" }, deviceA);
    const set = await sealReferenceSet(a.kek, creator, captures);

    // Only ciphertext leaves the device: no capture bytes appear anywhere in the stored object.
    const stored = JSON.stringify(set);
    for (const c of captures) expect(stored).not.toContain(new TextDecoder().decode(c));

    const deviceB = authenticator();
    deviceB.sync(deviceA.credentials);
    const b = await namespaceKey({ kind: "reference" }, deviceB);
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(b.credentialId).toBe(a.credentialId);
    const opened = await openReferenceSet(b.kek, JSON.parse(stored));
    expect(opened.map((x) => new TextDecoder().decode(x))).toEqual(["capture-front", "capture-left", "capture-right"]);
  });

  it("a fresh device without the passkey cannot derive anything", async () => {
    const deviceA = authenticator();
    await createPasskey({ name: "creator", displayName: "Creator" }, { kind: "reference" }, deviceA);
    await expect(namespaceKey({ kind: "reference" }, authenticator())).rejects.toThrow();
  });

  it("a different passkey derives an unrelated key that fails to decrypt", async () => {
    const deviceA = authenticator();
    const a = await createPasskey({ name: "creator", displayName: "Creator" }, { kind: "reference" }, deviceA);
    const set = await sealReferenceSet(a.kek, creator, captures);
    const other = await createPasskey({ name: "other", displayName: "Other" }, { kind: "reference" }, authenticator());
    expect(other.fingerprint).not.toBe(a.fingerprint);
    await expect(openReferenceSet(other.kek, set)).rejects.toThrow();
  });
});

describe("namespace isolation", () => {
  it("each namespace yields an unrelated key from the same passkey", async () => {
    const device = authenticator();
    const ref = await createPasskey({ name: "c", displayName: "C" }, { kind: "reference" }, device);
    const l1 = await namespaceKey({ kind: "licence", licenceId: 1n }, device);
    const l2 = await namespaceKey({ kind: "licence", licenceId: 2n }, device);
    const brand = await namespaceKey({ kind: "brand", brandId: "acme" }, device);
    const prints = new Set([ref.fingerprint, l1.fingerprint, l2.fingerprint, brand.fingerprint]);
    expect(prints.size).toBe(4);

    const set = await sealReferenceSet(ref.kek, creator, captures);
    await expect(openReferenceSet(l1.kek, set)).rejects.toThrow();
  });

  it("the same passkey under another rpId derives a different key", async () => {
    const device = authenticator();
    const a = await createPasskey({ name: "c", displayName: "C" }, { kind: "reference" }, device);
    process.env.NEXT_PUBLIC_RP_ID = "evil.example";
    device.credentials.push({ ...device.credentials[0], rpId: "evil.example" });
    const b = await namespaceKey({ kind: "reference" }, device);
    process.env.NEXT_PUBLIC_RP_ID = "likeness.example";
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });

  it("brand identity seeds are stable per brand and distinct across brands", async () => {
    const seed = async (prf: Uint8Array) => bytesToHex(await brandIdentitySeed(prf));
    const p1 = new Uint8Array(32).fill(1);
    const p2 = new Uint8Array(32).fill(2);
    expect(await seed(p1)).toBe(await seed(new Uint8Array(32).fill(1)));
    expect(await seed(p1)).not.toBe(await seed(p2));
  });
});

describe("envelope binding", () => {
  it("rejects a reference set moved to another creator", async () => {
    const device = authenticator();
    const k = await createPasskey({ name: "c", displayName: "C" }, { kind: "reference" }, device);
    const set = await sealReferenceSet(k.kek, creator, captures);
    await expect(openReferenceSet(k.kek, { ...set, creator: "0x2222222222222222222222222222222222222222" })).rejects.toThrow();
  });

  it("rejects swapped items", async () => {
    const device = authenticator();
    const k = await createPasskey({ name: "c", displayName: "C" }, { kind: "reference" }, device);
    const set = await sealReferenceSet(k.kek, creator, captures);
    const swapped = { ...set, items: [set.items[1], set.items[0], set.items[2]] };
    await expect(openReferenceSet(k.kek, swapped)).rejects.toThrow();
  });

  it("rejects a capture whose digest was altered", async () => {
    const device = authenticator();
    const k = await createPasskey({ name: "c", displayName: "C" }, { kind: "reference" }, device);
    const set = await sealReferenceSet(k.kek, creator, captures);
    const forged = { ...set, digests: [set.digests[1], set.digests[1], set.digests[2]] };
    await expect(openReferenceSet(k.kek, forged)).rejects.toThrow(/digest/);
  });

  it("hashes the ciphertext manifest deterministically", async () => {
    const device = authenticator();
    const k = await createPasskey({ name: "c", displayName: "C" }, { kind: "reference" }, device);
    const set = await sealReferenceSet(k.kek, creator, captures);
    expect(await referenceSetHash(set)).toBe(await referenceSetHash(JSON.parse(JSON.stringify(set))));
    expect(await referenceSetHash(set)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("licence release", () => {
  it("the service reads the set for its licence only", async () => {
    const device = authenticator();
    const ref = await createPasskey({ name: "c", displayName: "C" }, { kind: "reference" }, device);
    const set = await sealReferenceSet(ref.kek, creator, captures);

    const service = newServiceKey();
    const dek = await unwrapDek(ref.kek, set);
    const release = await releaseToService(dek, service.publicKey, 42n);
    dek.fill(0);

    const got = await acceptRelease(release, service.secretKey);
    expect(new TextDecoder().decode(await openItem(got, set, 0))).toBe("capture-front");

    // Re-labelling the release for another licence fails authentication.
    await expect(acceptRelease({ ...release, licenceId: "43" }, service.secretKey)).rejects.toThrow();
    // Another service key (e.g. after a restart) cannot open it.
    await expect(acceptRelease(release, newServiceKey().secretKey)).rejects.toThrow();
  });

  it("the creator can re-release from the licence namespace without the captures", async () => {
    const device = authenticator();
    const ref = await createPasskey({ name: "c", displayName: "C" }, { kind: "reference" }, device);
    const set = await sealReferenceSet(ref.kek, creator, captures);
    const dek = await unwrapDek(ref.kek, set);
    const lic = await namespaceKey({ kind: "licence", licenceId: 42n }, device);
    const backup = await wrapForLicence(dek, lic.kek, 42n);

    const again = await unwrapForLicence(backup, (await namespaceKey({ kind: "licence", licenceId: 42n }, device)).kek, 42n);
    expect(bytesToHex(again)).toBe(bytesToHex(dek));
    const wrongLicence = await namespaceKey({ kind: "licence", licenceId: 43n }, device);
    await expect(unwrapForLicence(backup, wrongLicence.kek, 42n)).rejects.toThrow();
  });
});
