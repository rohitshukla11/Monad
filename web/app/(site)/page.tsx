import { Landing, type ContractRow, type LandingCreator } from "@/components/landing/Landing";
import { explorer } from "@/lib/chain";
import { regionLabels } from "@/lib/categories";
import { deployment } from "@/lib/deployment";
import { usdc } from "@/lib/licensing";
import { listCreators } from "@/lib/server/protocol";

export const dynamic = "force-dynamic";

const CONTRACTS: { name: "CreatorRegistry" | "LicenseRegistry" | "LicenseEscrow" | "ReceiptAnchor"; does: string }[] = [
  { name: "CreatorRegistry", does: "Didit-backed attestation (ID 18+, liveness, face match), terms, payout and one-click revocation. Hashes only." },
  { name: "LicenseRegistry", does: "Non-transferable, expiring licences, issued against the creator's signature or inside their auto-approve terms." },
  { name: "LicenseEscrow", does: "USDC per licence. Each render pays the creator and anchors a receipt in one transaction; the rest is refundable." },
  { name: "ReceiptAnchor", does: "One receipt per delivered file, keyed by its sha256. Anyone can look a file up." },
];

export default async function Home() {
  let creators: LandingCreator[] = [];
  try {
    creators = (await listCreators())
      .filter((c) => c.trust.level === "verified" && c.canLicense)
      .map((c) => ({
        address: c.address,
        price: `$${usdc.format(c.terms.pricePerRender)}`,
        meta: `${c.trust.level === "verified" && c.trust.livenessMethod === "passive" ? "Passive" : "Full"} liveness · ${regionLabels(c.terms.regions).join(", ")}`,
      }));
  } catch {
    // The landing page still renders without chain access; the creators section then invites sign-ups.
  }
  const contracts: ContractRow[] = CONTRACTS.flatMap((c) => {
    const a = deployment[c.name];
    return a ? [{ name: c.name, address: a, url: explorer.address(a), does: c.does }] : [];
  });
  return <Landing creators={creators} contracts={contracts} />;
}
